import errno
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("host_diagnostics", Path(__file__).parents[1] / "host_diagnostics.py")
diagnostics = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(diagnostics)


def stat(pid=101, comm="java", start=100, minor=20, major=3, user=10, system=5, rss=100, state="S"):
    fields = ["0"] * 22
    for index, value in {0: state, 7: minor, 9: major, 11: user, 12: system, 19: start, 21: rss}.items():
        fields[index] = str(value)
    return str(pid) + " (" + comm + ") " + " ".join(fields) + "\n"


class SamplerTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.proc = self.root / "proc"
        self.sys = self.root / "sys"
        (self.sys / "block/nvme0n1").mkdir(parents=True)
        self.now = 100.0
        self.sampler = diagnostics.Sampler(self.proc, self.sys, lambda: self.now)
        self.write("sys/kernel/random/boot_id", "boot-one")
        self.write("meminfo", "MemTotal: 100000 kB\nMemFree: 1 kB\nMemAvailable: 30000 kB\nDirty: 3 kB\n")
        self.write("vmstat", "pgmajfault 5\npgscan_direct 10\npgsteal_kswapd 30\nallocstall_normal 1\n"
                   "workingset_refault_file 20\npswpin 0\noom_kill 0\nnr_free_pages 999\n")
        self.write("stat", "cpu 10 2 3 100 7 2 1 0\ncpu0 1 2 3 4\nprocs_running 2\nprocs_blocked 1\n")
        self.write("diskstats", "259 0 nvme0n1 1 0 100 3 2 0 50 4 0 7 8\n259 1 nvme0n1p1 1 0 100 3 2 0 50 4 0 7 8\n")
        for kind in ("memory", "io"):
            self.write("pressure/" + kind, "some avg10=0.10 avg60=0.05 avg300=0.01 total=100\n"
                       "full avg10=0.00 avg60=0.00 avg300=0.00 total=20\n")
        self.process()
        self.cgroup()

    def write(self, path, text):
        target = self.proc / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def process(self, pid=101, comm="java", read_bytes=1000, **kwargs):
        self.write(str(pid) + "/stat", stat(pid=pid, comm=comm, **kwargs))
        self.write(str(pid) + "/io", "read_bytes: " + str(read_bytes) + "\nwrite_bytes: 500\nrchar: 2000\nwchar: 600\n")
        self.write(str(pid) + "/status", "Name:\t" + comm + "\nRssAnon: 90 kB\nRssFile: 10 kB\nVmSwap: 0 kB\n")
        self.write(str(pid) + "/wchan", "io_schedule")
        self.write(str(pid) + "/cgroup", "0::/service\n")

    def cgroup(self, read_bytes=1000):
        root = self.sys / "fs/cgroup/service"
        root.mkdir(parents=True, exist_ok=True)
        for name, text in {"memory.current": "90000", "memory.stat": "anon 80000\nfile 10000\npgmajfault 5\nunknown 3\n",
                           "memory.events": "low 0\nhigh 1\nmax 0\noom 0\noom_kill 0\n",
                           "io.stat": "259:0 rbytes=" + str(read_bytes) + " wbytes=500 rios=3 wios=2\n"}.items():
            (root / name).write_text(text)

    def next_sample(self):
        self.now += 5
        return self.sampler.sample()

    def test_process_stat_handles_parentheses_and_spaces(self):
        parsed = diagnostics.parse_process_stat(stat(comm="worker ) (name", rss=7, major=12), 4096)
        self.assertEqual(parsed["comm"], "worker ) (name")
        self.assertEqual(parsed["major_faults"], 12)
        self.assertEqual(parsed["rss_bytes"], 7 * 4096)

    def test_host_and_process_deltas_have_correct_units(self):
        first = self.sampler.sample()
        self.assertNotIn("delta", first["processes"][0])
        self.process(read_bytes=2024, major=13, user=20)
        self.write("vmstat", "pgmajfault 9\npgscan_direct 16\n")
        self.write("diskstats", "259 0 nvme0n1 2 0 108 4 2 0 50 4 1 9 10\n")
        sample = self.next_sample()
        self.assertEqual(sample["memory_bytes"]["MemAvailable"], 30000 * 1024)
        self.assertEqual(sample["vmstat_delta"], {"pgmajfault": 4, "pgscan_direct": 6})
        self.assertEqual(len(sample["disks"]), 1)
        self.assertEqual(sample["disks"][0]["delta"]["sectors_read"], 8)
        self.assertNotIn("in_flight", sample["disks"][0]["delta"])
        self.assertEqual(sample["processes"][0]["read_bytes_per_second"], 1024 / 5)
        self.assertEqual(sample["processes"][0]["major_faults_per_second"], 2)
        self.assertEqual(sample["processes"][0]["memory_bytes"]["RssAnon"], 90 * 1024)
        self.assertEqual(sample["pressure"]["io"]["some"]["total"], 100)
        self.assertEqual(sample["errors"], {})

    def test_missing_counters_and_reset_counters_are_not_zero_deltas(self):
        self.sampler.sample()
        self.write("101/io", "read_bytes: 5\n")
        self.write("vmstat", "pgmajfault 2\n")
        sample = self.next_sample()
        self.assertEqual(sample["vmstat_delta"], {})
        self.assertNotIn("read_bytes_per_second", sample["processes"][0])
        self.assertNotIn("write_bytes", sample["processes"][0]["io"])
        self.assertNotIn("write_bytes", sample["processes"][0]["delta"])

    def test_inaccessible_process_io_preserves_other_evidence(self):
        original = Path.open
        def open_file(path, *args, **kwargs):
            if path == self.proc / "101/io":
                raise PermissionError(errno.EACCES, "denied")
            return original(path, *args, **kwargs)
        with patch.object(Path, "open", open_file):
            sample = self.sampler.sample()
        self.assertNotIn("io", sample["processes"][0])
        self.assertEqual(sample["errors"]["process_io"], {"PermissionError:13": 1})
        self.assertIn("rss_bytes", sample["processes"][0])

    def test_pid_reuse_does_not_attribute_old_io_to_new_process(self):
        self.sampler.sample()
        self.process(start=101, read_bytes=9000)
        sample = self.next_sample()
        self.assertNotIn("delta", sample["processes"][0])

    def test_new_reader_is_visible_without_inventing_a_rate(self):
        for pid in range(200, 210):
            self.process(pid=pid, comm="large", rss=1000, read_bytes=0)
        self.sampler.sample()
        self.process(pid=300, comm="reader", rss=1, read_bytes=1000000)
        sample = self.next_sample()
        process = next(p for p in sample["processes"] if p["pid"] == 300)
        self.assertEqual(process["io"]["read_bytes"], 1000000)
        self.assertIn("read_total", process["selected_by"])
        self.assertNotIn("read_bytes_per_second", process)

    def test_partial_cpu_counter_reset_omits_cpu_rate(self):
        self.sampler.sample()
        self.process(user=1, system=10)
        process = self.next_sample()["processes"][0]
        self.assertNotIn("cpu_ticks_per_second", process)
        self.assertNotIn("user_ticks", process["delta"])
        self.assertEqual(process["delta"]["system_ticks"], 5)

    def test_pid_reuse_during_scan_is_discarded(self):
        original = self.sampler.read
        def read(path, source, parser=lambda text: text.strip()):
            value = original(path, source, parser)
            if source == "process_stat_check":
                value["starttime_ticks"] += 1
            return value
        with patch.object(self.sampler, "read", read):
            sample = self.sampler.sample()
        self.assertEqual(sample["processes"], [])
        self.assertEqual(sample["errors"]["process_scan"], {"exited_or_reused": 1})

    def test_missing_sample_requires_new_process_io_baseline(self):
        self.sampler.sample()
        (self.proc / "101/stat").unlink()
        self.assertEqual(self.next_sample()["process_scan"]["sampled"], 0)
        self.process(read_bytes=2000)
        self.assertNotIn("delta", self.next_sample()["processes"][0])

    def test_boot_identity_change_clears_baselines(self):
        self.sampler.sample()
        self.write("sys/kernel/random/boot_id", "boot-two")
        self.process(read_bytes=2000)
        sample = self.next_sample()
        self.assertNotIn("vmstat_delta", sample)
        self.assertNotIn("delta", sample["processes"][0])

    def test_selection_is_bounded_and_keeps_services(self):
        for pid in range(200, 260):
            self.process(pid=pid, comm="worker", rss=pid, major=pid, user=pid, state="D")
        self.process(pid=300, comm="vector", rss=1)
        self.process(pid=301, comm="dockerd", rss=1)
        self.sampler.sample()
        for pid in range(200, 260):
            group = (pid - 200) // 12
            self.process(pid=pid, comm="worker", rss=pid, major=pid + (300 if group == 1 else 0),
                         user=pid + (300 if group == 2 else 0), read_bytes=5000 if group == 3 else 1000,
                         state="D" if group == 4 else "S")
        sample = self.next_sample()
        self.assertLessEqual(len(sample["processes"]), 25)
        self.assertTrue({101, 300, 301}.issubset({p["pid"] for p in sample["processes"]}))
        self.assertEqual(sample["process_scan"]["services_omitted"], 0)
        self.assertEqual(len(sample["cgroups"]), 1)
        self.assertNotIn("cmdline", json.dumps(sample))

    def test_cgroup_io_captures_short_lived_processes_without_duplicate_scopes(self):
        self.process(pid=102, comm="vector")
        self.sampler.sample()
        self.cgroup(read_bytes=12000)
        sample = self.next_sample()
        self.assertEqual(len(sample["cgroups"]), 1)
        group = sample["cgroups"][0]
        self.assertEqual(group["io_stat_delta"]["259:0"]["rbytes"], 11000)
        self.assertEqual(group["memory_current_bytes"], 90000)
        self.assertNotIn("unknown", group["memory_stat"])

    def test_missing_host_source_is_explicit_and_does_not_stop_sample(self):
        (self.proc / "pressure/io").unlink()
        self.write("vmstat", "invalid text with too many fields\n")
        sample = self.sampler.sample()
        self.assertNotIn("io", sample["pressure"])
        self.assertNotIn("vmstat", sample)
        self.assertEqual(sample["errors"]["pressure_io"], {"FileNotFoundError:2": 1})
        self.assertEqual(sample["errors"]["vmstat"], {"ValueError": 1})
        self.assertEqual(sample["process_scan"]["sampled"], 1)


class HookTest(unittest.TestCase):
    def test_installation_failure_does_not_fail_deployment(self):
        server = Path(__file__).parents[2]
        for kind in ("hooks", "confighooks"):
            for exit_code in (0, 23):
                with self.subTest(kind=kind, exit_code=exit_code), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    hook = root / ".platform" / kind / "postdeploy/host-diagnostics.sh"
                    hook.parent.mkdir(parents=True)
                    hook.write_text((server / hook.relative_to(root)).read_text())
                    installer = root / "scripts/install_host_diagnostics.sh"
                    installer.parent.mkdir()
                    installer.write_text("echo installer-ran\nexit " + str(exit_code) + "\n")
                    result = subprocess.run(["bash", str(hook)], capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(result.stdout, "installer-ran\n")
                    if exit_code:
                        self.assertIn("Host diagnostics installation failed; continuing deployment.", result.stderr)
                    else:
                        self.assertEqual(result.stderr, "")


class OutputTest(unittest.TestCase):
    def test_rotation_retains_only_complete_lines_within_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "samples.jsonl"
            output = diagnostics.Output(str(path), max_bytes=100, backups=2)
            for index in range(100):
                output.write({"index": index, "padding": "a" * 10})
            output.close()
            files = list(Path(directory).iterdir())
            self.assertEqual(len(files), 3)
            for item in files:
                self.assertLessEqual(item.stat().st_size, 100)
                self.assertTrue(item.read_bytes().endswith(b"\n"))
                for line in item.read_text().splitlines():
                    json.loads(line)
            self.assertEqual(json.loads(path.read_text().splitlines()[-1])["index"], 99)

    def test_oversized_sample_cannot_exceed_disk_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "samples.jsonl"
            output = diagnostics.Output(str(path), max_bytes=20, backups=2)
            self.addCleanup(output.close)
            with self.assertRaises(ValueError):
                output.write({"padding": "a" * 100})
            self.assertEqual(path.stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
