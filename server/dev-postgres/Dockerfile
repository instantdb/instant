FROM postgres:16

RUN apt-get update && \
    apt-get install -y \
      build-essential \
      postgresql-server-dev-16 \
      postgresql-16-pg-hint-plan \
      wget && \
    mkdir build && cd build && \
    wget https://github.com/eulerto/wal2json/archive/refs/tags/wal2json_2_6.tar.gz && \
    tar -zxf wal2json_2_6.tar.gz && \
    cd wal2json-wal2json_2_6 && \
    make && \
    make install && \
    cd ../.. && \
    rm -rf build && \
    apt-get remove -y \
    build-essential \
    postgresql-server-dev-16 \
    wget && \
    apt-get autoremove -y && \
    apt-get clean

CMD ["postgres", \
       "-c", "wal_level=logical", \
       "-c", "max_replication_slots=4", \
       "-c", "max_wal_senders=4", \
       "-c", "shared_preload_libraries=pg_hint_plan", \
       "-c", "random_page_cost=1.1"]
