# Scratch = 0MB base image (smallest possible)
# Binary is pre-built on Windows via build.bat (cross + musl static)
# CA certs are bundled via webpki-roots (no system certs needed)
FROM scratch

COPY cloudstore-api /usr/local/bin/cloudstore-api 

ENV CLOUDSTORE_CACHE_DIR=/data/cache
ENV CLOUDSTORE_PORT=8080
EXPOSE 8080

VOLUME ["/data/cache"]
ENTRYPOINT ["/usr/local/bin/cloudstore-api"]
