#!/bin/bash
set -e

# setup ros2 environment
source "/opt/ros/${ROS_DISTRO}/setup.bash"
source "/ws_rosbridge/install/setup.bash"

exec "$@"
