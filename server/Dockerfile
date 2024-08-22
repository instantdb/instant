FROM amazoncorretto:22 AS builder

WORKDIR /app

RUN yum -y install tar gzip git

RUN curl -L -O https://github.com/clojure/brew-install/releases/download/1.11.3.1463/linux-install.sh

RUN chmod +x linux-install.sh
RUN ./linux-install.sh

COPY deps.edn .

RUN clojure -P

COPY . .

RUN clojure -X:deps tree

RUN clojure -T:build uber

FROM amazoncorretto:22

WORKDIR /app

COPY --from=builder /app/target/instant-standalone.jar ./target/instant-standalone.jar

EXPOSE 5000
EXPOSE 6005
