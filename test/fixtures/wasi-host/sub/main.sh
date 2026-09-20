#!/bin/bash
# shellcheck source=../lib/util.sh
source ../lib/util.sh

UNUSED_LOCAL="silenced by disable=SC2034 in this directory's .shellcheckrc"
echo $UTIL_HOME
util_greet
echo $1
