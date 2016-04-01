#!/bin/bash
set -e # exit with nonzero exit code if anything fails
if [ "$TRAVIS_PULL_REQUEST" != "false" ]; then
	exit 1
fi
git push --quiet "https://${GH_TOKEN}@${GH_REF}" master:gh-pages > /dev/null 2>&1