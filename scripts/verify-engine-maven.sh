#!/bin/sh
# Do not publish npm consumers before their native Maven dependency is available.
set -eu
version=${1:?Provide the native engine version}
case "$version" in ''|*[!0-9A-Za-z.-]*) echo "Invalid Maven version" >&2; exit 1 ;; esac
base="https://repo.maven.apache.org/maven2/io/github/rdlabo/native-ui-engine/$version/native-ui-engine-$version"
for extension in pom aar; do
  curl --fail --silent --show-error --head --max-time 30 "$base.$extension" >/dev/null
done
