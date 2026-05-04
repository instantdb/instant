(ns instant.smokescreen
  "SSRF prevention, ported from Stripe's smokescreen https://github.com/stripe/smokescreen"
  (:require
   [instant.flags :as flags])
  (:import
   (inet.ipaddr IPAddress IPAddressString)
   (inet.ipaddr.ipv4 IPv4Address)
   (inet.ipaddr.ipv6 IPv6Address)
   (java.net Inet4Address Inet6Address InetAddress)))

(defn inet->ip ^IPAddress [^InetAddress a]
  (condp instance? a
    Inet4Address (IPv4Address. (.getAddress a))
    Inet6Address (IPv6Address. (.getAddress a))))

;; RFC 6598 CGNAT range (shouldn't be publically routable)
(def ^{:tag IPAddress} cgnat-range (.toAddress (IPAddressString. "100.64.0.0/10")))
;; RFC 6052 NAT64 well-known prefix
(def ^{:tag IPAddress} nat64-well-known-prefix (.toAddress (IPAddressString. "64:ff9b::/96")))
;; RFC 3056 6to4 prefix (embeds IPv4 address)
(def ^{:tag IPAddress} six->four-prefix (.toAddress (IPAddressString. "2002::/16")))
;; RFC 4380 Teredo prefix (embeds IPv4 addresses)
(def ^{:tag IPAddress} teredo-prefix (.toAddress (IPAddressString. "2001::/32")))
(def ^{:tag IPAddress} broadcast-ip (.toAddress (IPAddressString. "255.255.255.255")))
(def ^{:tag IPAddress} zero-ip4 (.toAddress (IPAddressString. "0.0.0.0")))
(def ^{:tag IPAddress} zero-ip6 (IPv6Address. (byte-array 16)))

(defn cgnat? [^IPAddress ip]
  (.contains cgnat-range ip))

(defn has-ipv6-embedding?
  "checks if an IPv6 address uses any IPv4 embedding scheme."
  [^IPAddress ip]
  (and (.isIPv6 ip)
       (or (.contains nat64-well-known-prefix ip)
           (.contains six->four-prefix ip)
           (.contains teredo-prefix ip))))

(defn link-local-unicast? [^IPAddress ip]
  (condp instance? ip
    IPv4Address (and (-> ip
                         (.getSegment 0)
                         (.getSegmentValue)
                         (= 169))
                     (-> ip
                         (.getSegment 1)
                         (.getSegmentValue)
                         (= 254)))
    IPv6Address (let [[f s] (.getBytes ip)]
                  (and (= (bit-and f 0xff) 0xfe)
                       (= (bit-and s 0xc0) 0x80)))))

(defn unicast?
  "Checks that the IP is not a broadcast IP
   https://cs.opensource.google/go/go/+/refs/tags/go1.26.2:src/net/ip.go;l=192"
  [^IPAddress ip]
  (and (not= ip broadcast-ip)
       (not= ip zero-ip4)
       (not= ip zero-ip6)
       (not (.isMulticast ip))
       (not (link-local-unicast? ip))))

(defn bad-ip? [inet-ip]
  (and (not (contains? (flags/smokescreen-whitelist-ips) inet-ip))
       (let [ip (inet->ip inet-ip)]
         (or (.isLocal ip)
             (.isLoopback ip)
             (not (unicast? ip))
             (cgnat? ip)
             (has-ipv6-embedding? ip)))))
