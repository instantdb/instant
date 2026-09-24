#!/usr/bin/env python3
"""Sample Linux host pressure independently of the JVM; never read process arguments."""

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import signal
import sys
import threading
import time


MEMORY_KEYS = set("MemTotal MemFree MemAvailable Buffers Cached SwapCached Active "
                  "Inactive Active(anon) Inactive(anon) Active(file) Inactive(file) "
                  "Unevictable Mlocked SwapTotal SwapFree Dirty Writeback AnonPages "
                  "Mapped Shmem Slab SReclaimable SUnreclaim KernelStack PageTables "
                  "Committed_AS AnonHugePages".split())
VM_KEYS = {"pgfault", "pgmajfault", "pswpin", "pswpout", "oom_kill", "compact_stall"}
VM_PREFIXES = ("pgscan_", "pgsteal_", "allocstall", "workingset_refault")
CPU_KEYS = "user nice system idle iowait irq softirq steal guest guest_nice".split()
DISK_KEYS = ("reads_completed reads_merged sectors_read read_ms writes_completed "
             "writes_merged sectors_written write_ms in_flight io_ms weighted_io_ms "
             "discards_completed discards_merged sectors_discarded discard_ms "
             "flushes_completed flush_ms").split()
IO_KEYS = {"read_bytes", "write_bytes", "rchar", "wchar"}
PROCESS_COUNTERS = ("minor_faults", "major_faults", "user_ticks", "system_ticks")
SERVICE_NAMES = {"java", "vector", "dockerd", "amazon-cloudwat"}
CGROUP_MEMORY_KEYS = set("anon file kernel kernel_stack pagetables sock shmem file_mapped "
                         "file_dirty file_writeback slab workingset_refault_anon "
                         "workingset_refault_file pgfault pgmajfault pgscan pgsteal "
                         "pgscan_kswapd pgscan_direct pgsteal_kswapd pgsteal_direct".split())


def counter_delta(current, previous):
    """Missing or reset counters have no delta, rather than a misleading zero."""
    return {key: value - previous[key] for key, value in current.items()
            if key in previous and value >= previous[key]}


def parse_process_stat(text, page_size):
    head, separator, tail = text.rpartition(") ")
    if not separator:
        raise ValueError("missing process name")
    pid, comm = head.split(" (", 1)
    fields = tail.split()
    return {"pid": int(pid), "comm": comm, "state": fields[0],
            "minor_faults": int(fields[7]), "major_faults": int(fields[9]),
            "user_ticks": int(fields[11]), "system_ticks": int(fields[12]),
            "starttime_ticks": int(fields[19]), "rss_bytes": int(fields[21]) * page_size}


class Sampler:
    def __init__(self, proc_root="/proc", sys_root="/sys", clock=time.monotonic):
        self.proc = Path(proc_root)
        self.sys = Path(sys_root)
        self.clock = clock
        self.page_size = os.sysconf("SC_PAGE_SIZE")
        self.previous = None
        self.previous_processes = {}
        self.errors = defaultdict(Counter)

    def read(self, path, source, parser=lambda value: value.strip()):
        try:
            with path.open(encoding="utf-8", errors="replace") as stream:
                text = stream.read(262145)
            if len(text) > 262144:
                raise ValueError("oversized proc file")
            return parser(text)
        except (OSError, ValueError, IndexError) as error:
            kind = type(error).__name__
            if isinstance(error, OSError):
                kind += ":" + str(error.errno)
            self.errors[source][kind] += 1
            return None

    def memory(self, text):
        result = {}
        for line in text.splitlines():
            key, value = line.split(":", 1)
            if key in MEMORY_KEYS:
                amount, unit = value.split()
                if unit != "kB":
                    raise ValueError("unexpected memory unit")
                result[key] = int(amount) * 1024
        return result

    def vmstat(self, text):
        result = {}
        for line in text.splitlines():
            key, value = line.split()
            if key in VM_KEYS or key.startswith(VM_PREFIXES):
                result[key] = int(value)
        return result

    def cpu(self, text):
        result = {}
        for line in text.splitlines():
            fields = line.split()
            if fields[0] == "cpu":
                result["ticks"] = dict(zip(CPU_KEYS, map(int, fields[1:])))
            elif fields[0] in ("procs_running", "procs_blocked"):
                result[fields[0]] = int(fields[1])
        return result

    def pressure(self, text):
        result = {}
        for line in text.splitlines():
            name, *fields = line.split()
            result[name] = {key: int(value) if key == "total" else float(value)
                            for key, value in (field.split("=") for field in fields)}
        return result

    def disks(self, text):
        # /sys/block excludes partitions, avoiding double-counting disk traffic.
        devices = {path.name for path in (self.sys / "block").iterdir()}
        result = []
        for line in text.splitlines():
            major, minor, name, *fields = line.split()
            if name in devices:
                result.append({"name": name, "major": int(major), "minor": int(minor),
                               "counters": dict(zip(DISK_KEYS, map(int, fields)))})
        return result

    def process_io(self, text):
        result = {}
        for line in text.splitlines():
            key, value = line.split(":", 1)
            if key in IO_KEYS:
                result[key] = int(value)
        return result

    def process_status(self, text):
        result = {}
        for line in text.splitlines():
            key, _, value = line.partition(":")
            if key in ("RssAnon", "RssFile", "RssShmem", "VmSwap"):
                amount, unit = value.split()
                if unit != "kB":
                    raise ValueError("unexpected memory unit")
                result[key] = int(amount) * 1024
        return result

    def processes(self, elapsed):
        result = {}
        seen = 0
        try:
            paths = sorted((path for path in self.proc.iterdir() if path.name.isdigit()),
                           key=lambda path: int(path.name))
        except OSError as error:
            self.errors["process_scan"][type(error).__name__] += 1
            return {}, {"seen": 0, "sampled": 0}
        for path in paths:
            seen += 1
            parser = lambda text: parse_process_stat(text, self.page_size)
            process = self.read(path / "stat", "process_stat", parser)
            if process is None:
                continue
            io = self.read(path / "io", "process_io", self.process_io)
            # A process may exit and its PID be reused between the two reads.
            after = self.read(path / "stat", "process_stat_check", parser)
            if after is None or after["starttime_ticks"] != process["starttime_ticks"]:
                self.errors["process_scan"]["exited_or_reused"] += 1
                continue
            if io is not None:
                process["io"] = io
            identity = (process["pid"], process["starttime_ticks"])
            previous = self.previous_processes.get(identity)
            if previous is not None and elapsed is not None and elapsed > 0:
                current_counts = {key: process[key] for key in PROCESS_COUNTERS}
                previous_counts = {key: previous[key] for key in PROCESS_COUNTERS}
                delta = counter_delta(current_counts, previous_counts)
                delta.update(counter_delta(process.get("io", {}), previous.get("io", {})))
                process["delta"] = delta
                if "read_bytes" in delta:
                    process["read_bytes_per_second"] = delta["read_bytes"] / elapsed
                if "major_faults" in delta:
                    process["major_faults_per_second"] = delta["major_faults"] / elapsed
                if "user_ticks" in delta and "system_ticks" in delta:
                    process["cpu_ticks_per_second"] = (delta["user_ticks"] + delta["system_ticks"]) / elapsed
            result[identity] = process
        return result, {"seen": seen, "sampled": len(result)}

    def select_processes(self, processes):
        selected = {}
        categories = {}

        def select(name, candidates, key):
            categories[name] = sorted(candidates, key=key, reverse=True)[:5]

        rows = list(processes.values())
        select("read", (p for p in rows if p.get("read_bytes_per_second", 0) > 0),
               lambda p: p["read_bytes_per_second"])
        select("read_total", (p for p in rows if "read_bytes_per_second" not in p
                              and p.get("io", {}).get("read_bytes", 0) > 0),
               lambda p: p["io"]["read_bytes"])
        select("fault", (p for p in rows if p.get("major_faults_per_second", 0) > 0),
               lambda p: p["major_faults_per_second"])
        select("rss", rows, lambda p: p["rss_bytes"])
        select("blocked", (p for p in rows if p["state"] == "D"), lambda p: p["rss_bytes"])
        select("cpu", (p for p in rows if p.get("cpu_ticks_per_second", 0) > 0),
               lambda p: p["cpu_ticks_per_second"])
        services = sorted((p for p in rows if p["comm"] in SERVICE_NAMES),
                          key=lambda p: (p["comm"] == "java", p["rss_bytes"]), reverse=True)
        ordered = services + [category[index] for index in range(5)
                              for category in categories.values() if index < len(category)]
        for process in ordered:
            identity = (process["pid"], process["starttime_ticks"])
            if identity not in selected and len(selected) < 25:
                selected[identity] = {**process, "selected_by": [name for name, category in categories.items()
                                                               if process in category]}
                if process["comm"] in SERVICE_NAMES:
                    selected[identity]["selected_by"].append("service")
        for process in selected.values():
            path = self.proc / str(process["pid"])
            wchan = self.read(path / "wchan", "process_wchan")
            status = self.read(path / "status", "process_status", self.process_status)
            cgroup = self.read(path / "cgroup", "process_cgroup") if process["comm"] in ("java", "vector") else None
            after = self.read(path / "stat", "process_wchan_check",
                              lambda text: parse_process_stat(text, self.page_size))
            if after is not None and after["starttime_ticks"] == process["starttime_ticks"]:
                if wchan is not None:
                    process["wchan"] = wchan
                if status is not None:
                    process["memory_bytes"] = status
                if cgroup is not None:
                    for line in cgroup.splitlines():
                        if line.startswith("0::/"):
                            process["cgroup"] = line[3:]
            else:
                self.errors["process_scan"]["exited_or_reused_after_selection"] += 1
        omitted = sum((p["pid"], p["starttime_ticks"]) not in selected for p in services)
        return list(selected.values()), omitted

    def cgroups(self, processes):
        result = []
        root = self.sys / "fs/cgroup"
        for scope in sorted({p["cgroup"] for p in processes if "cgroup" in p}):
            path = root / scope.lstrip("/")
            if ".." in path.parts:
                self.errors["cgroup"]["invalid_path"] += 1
                continue
            entry = {"path": scope}
            def pairs(text):
                return {key: int(value) for key, value in (line.split() for line in text.splitlines())}
            def io_stats(text):
                return {device: {key: int(value) for key, value in (field.split("=") for field in fields)}
                        for device, *fields in (line.split() for line in text.splitlines())}
            for key, filename, parser in (("memory_current_bytes", "memory.current", int),
                                           ("memory_stat", "memory.stat", pairs),
                                           ("memory_events", "memory.events", pairs),
                                           ("io_stat", "io.stat", io_stats)):
                value = self.read(path / filename, "cgroup_" + filename, parser)
                if value is not None:
                    if key == "memory_stat":
                        value = {key: count for key, count in value.items() if key in CGROUP_MEMORY_KEYS}
                    entry[key] = value
            result.append(entry)
        return result

    def sample(self):
        self.errors = defaultdict(Counter)
        started = self.clock()
        elapsed = started - self.previous["monotonic_seconds"] if self.previous else None
        sample = {"timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                  "monotonic_seconds": started, "interval_seconds": elapsed,
                  "clock_ticks_per_second": os.sysconf("SC_CLK_TCK")}
        sources = (("boot_id", "sys/kernel/random/boot_id", lambda text: text.strip()),
                   ("memory_bytes", "meminfo", self.memory), ("vmstat", "vmstat", self.vmstat),
                   ("cpu", "stat", self.cpu), ("disks", "diskstats", self.disks))
        for key, path, parser in sources:
            value = self.read(self.proc / path, key, parser)
            if value is not None:
                sample[key] = value
        sample["pressure"] = {}
        for key in ("memory", "io"):
            value = self.read(self.proc / "pressure" / key, "pressure_" + key, self.pressure)
            if value is not None:
                sample["pressure"][key] = value
        previous = self.previous or {}
        if sample.get("boot_id") != previous.get("boot_id"):
            previous = {}
            self.previous_processes = {}
        for key in ("vmstat",):
            if key in sample and key in previous:
                sample[key + "_delta"] = counter_delta(sample[key], previous[key])
        if "cpu" in sample and "cpu" in previous:
            sample["cpu_delta"] = counter_delta(sample["cpu"].get("ticks", {}),
                                                 previous["cpu"].get("ticks", {}))
        previous_disks = {(d["name"], d["major"], d["minor"]): d for d in previous.get("disks", [])}
        for disk in sample.get("disks", []):
            before = previous_disks.get((disk["name"], disk["major"], disk["minor"]))
            if before is not None:
                disk["delta"] = counter_delta(disk["counters"], before["counters"])
                disk["delta"].pop("in_flight", None)  # Gauge, not a cumulative counter.
        processes, counts = self.processes(elapsed)
        sample["processes"], counts["services_omitted"] = self.select_processes(processes)
        sample["cgroups"] = self.cgroups(sample["processes"])
        previous_cgroups = {group["path"]: group for group in previous.get("cgroups", [])}
        for group in sample["cgroups"]:
            before = previous_cgroups.get(group["path"], {})
            if "memory_events" in group and "memory_events" in before:
                group["memory_events_delta"] = counter_delta(group["memory_events"], before["memory_events"])
            if "io_stat" in group and "io_stat" in before:
                group["io_stat_delta"] = {device: counter_delta(counts, before["io_stat"][device])
                                          for device, counts in group["io_stat"].items()
                                          if device in before["io_stat"]}
        counts["selected"] = len(sample["processes"])
        sample["process_scan"] = counts
        sample["errors"] = dict(self.errors)
        sample["duration_ms"] = (self.clock() - started) * 1000
        self.previous = sample
        self.previous_processes = processes
        return sample


class Output:
    def __init__(self, path, max_bytes, backups):
        self.path = Path(path) if path != "-" else None
        self.max_bytes = max_bytes
        self.backups = backups
        self.stream = self.path.open("ab") if self.path else sys.stdout.buffer

    def write(self, sample):
        line = (json.dumps(sample, separators=(",", ":"), allow_nan=False) + "\n").encode()
        if self.path and len(line) > self.max_bytes:
            raise ValueError("sample exceeds max-bytes")
        if self.path and self.stream.tell() + len(line) > self.max_bytes:
            self.stream.close()
            for index in range(self.backups, 0, -1):
                source = self.path if index == 1 else Path(str(self.path) + "." + str(index - 1))
                if source.exists():
                    os.replace(source, str(self.path) + "." + str(index))
            self.stream = self.path.open("wb")
        self.stream.write(line)
        self.stream.flush()

    def close(self):
        if self.path:
            self.stream.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval", type=float, default=5)
    parser.add_argument("--output", default="-")
    parser.add_argument("--max-bytes", type=int, default=5 * 1024 * 1024)
    parser.add_argument("--backups", type=int, default=2)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if not math.isfinite(args.interval) or args.interval <= 0 or args.max_bytes < 1 or args.backups < 1:
        parser.error("interval, max-bytes and backups must be positive")
    if not Path("/proc/meminfo").is_file():
        parser.error("Linux /proc is required")
    stopped = threading.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda _signum, _frame: stopped.set())
    sampler = Sampler()
    output = Output(args.output, args.max_bytes, args.backups)
    try:
        while not stopped.is_set():
            started = time.monotonic()
            output.write(sampler.sample())
            if args.once:
                break
            stopped.wait(max(0, args.interval - (time.monotonic() - started)))
    finally:
        output.close()


if __name__ == "__main__":
    main()
