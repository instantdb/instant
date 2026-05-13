(ns instant.smokescreen-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.flags :as flags]
   [instant.smokescreen :as smokescreen])
  (:import
   (java.net InetAddress)))

;; SSRF-prevention tests. Ported from stripe/smokescreen's TestClassifyAddr
;; (pkg/smokescreen/smokescreen_test.go) so we know that the DNS resolver
;; webhook-sender installs into okhttp won't let users reach our internal
;; network (e.g. localhost, the EC2 metadata endpoint at 169.254.169.254, etc.)

(defn bad-ip? [^String ip]
  (smokescreen/bad-ip? (InetAddress/getByName ip)))

(deftest bad-ip?-blocks-private-and-loopback
  (testing "RFC 1918 private ranges are blocked"
    (is (bad-ip? "10.0.0.1"))
    (is (bad-ip? "10.0.1.1"))
    (is (bad-ip? "172.16.0.1"))
    (is (bad-ip? "172.16.1.1"))
    (is (bad-ip? "192.168.0.1"))
    (is (bad-ip? "192.168.1.1")))

  (testing "loopback is blocked"
    (is (bad-ip? "127.0.0.1"))
    (is (bad-ip? "127.0.1.1"))
    (is (bad-ip? "127.255.255.255"))
    (is (bad-ip? "::1")))

  (testing "link-local (incl. EC2/AWS instance metadata) is blocked"
    (is (bad-ip? "169.254.169.254"))
    (is (bad-ip? "169.254.0.1"))
    (is (bad-ip? "fe80::1"))))

(deftest bad-ip?-allows-public-ips
  (testing "public IPv4 is not blocked"
    (is (not (bad-ip? "8.8.8.8")))
    (is (not (bad-ip? "1.1.1.1")))
    (is (not (bad-ip? "8.8.4.4"))))

  (testing "public IPv6 is not blocked"
    (is (not (bad-ip? "2001:4860:4860::8888"))) ;; Google DNS
    (is (not (bad-ip? "2606:4700:4700::1111"))) ;; Cloudflare DNS
    (is (not (bad-ip? "64:ff9c::1"))) ;; just outside NAT64 well-known prefix
    (is (not (bad-ip? "::ffff:8.8.8.8"))))) ;; IPv4-mapped public IP

(deftest bad-ip?-blocks-cgnat
  ;; RFC 6598 carrier-grade NAT range. Smokescreen rejects this even with
  ;; UnsafeAllowPrivateRanges because it's used inside cloud provider VPCs.
  (testing "CGNAT range (100.64.0.0/10) is blocked"
    (is (bad-ip? "100.64.0.1"))
    (is (bad-ip? "100.64.0.100"))
    (is (bad-ip? "100.127.255.254")))

  (testing "addresses just outside the CGNAT range are not blocked"
    (is (not (bad-ip? "100.63.255.254")))
    (is (not (bad-ip? "100.128.0.1")))))

(deftest bad-ip?-blocks-broadcast-and-multicast
  (testing "IPv4 broadcast is blocked"
    (is (bad-ip? "255.255.255.255")))
  (testing "multicast is blocked"
    (is (bad-ip? "224.0.0.1"))
    (is (bad-ip? "ff02:0:0:0:0:0:0:2"))))

(deftest bad-ip?-blocks-any-local
  (testing "0.0.0.0 / :: are blocked"
    (is (bad-ip? "0.0.0.0"))
    (is (bad-ip? "::"))))

(deftest bad-ip?-blocks-ipv6-embedded-ipv4
  ;; IPv6 addresses that embed IPv4 addresses can bypass the IPv4 safety
  ;; checks above and reach private/internal hosts. Smokescreen blocks all
  ;; three well-known embedding schemes.

  (testing "NAT64 well-known prefix (64:ff9b::/96) is blocked"
    (is (bad-ip? "64:ff9b::ac1c:5"))    ;; embeds 172.28.0.5
    (is (bad-ip? "64:ff9b::c000:201"))  ;; embeds 192.0.2.1
    (is (bad-ip? "64:ff9b::a00:1"))     ;; embeds 10.0.0.1
    (is (bad-ip? "64:ff9b::808:808"))   ;; embeds 8.8.8.8 — public via NAT64
    (is (bad-ip? "64:ff9b::ffff:ffff")));; embeds 255.255.255.255 via NAT64

  (testing "6to4 prefix (2002::/16) is blocked"
    (is (bad-ip? "2002:c000:201::1"))   ;; embeds 192.0.2.1
    (is (bad-ip? "2002:a00:1::1"))      ;; embeds 10.0.0.1
    (is (bad-ip? "2002:808:808::1")))   ;; embeds 8.8.8.8

  (testing "Teredo prefix (2001::/32) is blocked"
    (is (bad-ip? "2001:0:4136:e378:8000:63bf:3fff:fdd2"))
    (is (bad-ip? "2001:0:1234:5678:9abc:def0:1234:5678")))

  (testing "IPv4-mapped addresses are blocked if the underlying IPv4 is bad"
    (is (bad-ip? "::ffff:127.0.0.1"))
    (is (bad-ip? "::ffff:10.0.0.1"))
    (is (bad-ip? "::ffff:192.168.1.1"))))

(deftest bad-ip?-allows-whitelisted-addresses
  ;; Build the whitelist via the real parser so the InetAddress that bad-ip?
  ;; compares against is exactly what production produces (InetAddress/
  ;; getByAddress from parsed IP bytes, never InetAddress/getByName).
  (testing "an address in smokescreen-whitelist-ips bypasses the block"
    (binding [flags/*flag-overrides* {:smokescreen-whitelist-ips
                                      (flags/parse-ips-flag ["127.0.0.1"])}]
      (is (not (bad-ip? "127.0.0.1")))
      ;; A non-whitelisted address is still blocked.
      (is (bad-ip? "10.0.0.1"))))

  (testing "private/RFC1918 addresses can also be whitelisted"
    (binding [flags/*flag-overrides* {:smokescreen-whitelist-ips
                                      (flags/parse-ips-flag ["10.0.0.1"])}]
      (is (not (bad-ip? "10.0.0.1")))
      (is (bad-ip? "127.0.0.1"))))

  (testing "without the whitelist, the same addresses are blocked"
    (is (bad-ip? "127.0.0.1"))
    (is (bad-ip? "10.0.0.1"))))
