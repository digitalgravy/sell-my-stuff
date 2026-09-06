#!/bin/bash
# Runs the web server and the inspect_images worker as siblings in one
# container. There's no supervisor here on purpose -- if either process
# dies, this script tears the other down and exits non-zero so Docker's
# `unless-stopped` restart policy relaunches both together, rather than
# silently leaving a half-alive container (a web server up with no worker
# ever consuming its queued jobs, which is exactly the bug this replaces).
set -u

node server.js &
server_pid=$!

node dist/worker.cjs &
worker_pid=$!

shutting_down=0
on_term() {
  shutting_down=1
  kill -TERM "$server_pid" "$worker_pid" 2>/dev/null
}
trap on_term TERM INT

wait -n "$server_pid" "$worker_pid"
exit_code=$?

if [ "$shutting_down" -eq 0 ]; then
  echo "one of server.js/worker.mjs exited (code $exit_code) -- stopping the other so the container restarts both"
  kill -TERM "$server_pid" "$worker_pid" 2>/dev/null
fi

wait "$server_pid" 2>/dev/null
wait "$worker_pid" 2>/dev/null

exit "$exit_code"
