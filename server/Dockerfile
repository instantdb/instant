FROM amazoncorretto:22 AS builder

WORKDIR /app

RUN yum -y install tar gzip git unzip postgresql16

RUN curl -L -O https://github.com/clojure/brew-install/releases/download/1.11.3.1463/linux-install.sh

RUN echo '0c41063a2fefb53a31bc1bc236899955f759c5103dc0495489cdd74bf8f114bb  linux-install.sh' |  sha256sum -c

RUN chmod +x linux-install.sh
RUN ./linux-install.sh

RUN curl -L -O https://www.yourkit.com/download/docker/YourKit-JavaProfiler-2024.9-docker.zip

RUN echo 'f53ba6f7e63315471a1aa1a853f3a8111b90e6a55b21ba5c2029cc5dcb7513fa  YourKit-JavaProfiler-2024.9-docker.zip' | sha256sum -c

RUN unzip YourKit-JavaProfiler-2024.9-docker.zip

COPY deps.edn .

RUN clojure -P

COPY . .

RUN clojure -X:deps tree

RUN clojure -T:build uber

FROM amazoncorretto:22

WORKDIR /app

COPY --from=builder /app/target/instant-standalone.jar ./target/instant-standalone.jar
COPY --from=builder /app/YourKit-JavaProfiler-2024.9 /usr/local/YourKit-JavaProfiler-2024.9

EXPOSE 5000
EXPOSE 6005
