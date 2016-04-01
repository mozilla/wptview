# wptview
[![Build Status](https://travis-ci.org/mozilla/wptview.png?branch=master)](https://travis-ci.org/mozilla/wptview)


Webapp for displaying the results of web-platform-tests.

## Running wptview
This app runs on a local server. You may set up a local server by using Python's SimpleHTTPServer.

`python -m SimpleHTTPServer 8000`

Go to a browser and visit `localhost:8000`. WPT Viewer should start.

WPT Viewer needs to ingest some web-platform-tests mozlog files to get up and running. A good place to find mozlog files is Mozilla's [Treeherder](https://treeherder.mozilla.org/#/jobs?repo=mozilla-inbound) for mozilla-inbound.
These files are generally found under "Job Details" after clicking a job having structured logs (such as WPT) as an artifact. The typical name of these files are `testsuite_raw.log`, such as `wpt_raw.log` for the Web Platform Tests.
We have added an option in Treeherder present adjacent to these files. This option ingests the log in wptview along with an appropriate run name fetched from Treeherder.

A good log file to testing purposes may be found [here](http://mozilla-releng-blobs.s3.amazonaws.com/blobs/mozilla-inbound/sha512/05a68f7a1acdd9f9c800e587f576083678588c9271d9221878f3cf959063473bc6783ca09c75eacd39990ac037b0b9ec3c806a8e910c74388609fff1be8fe570).
If you wish to test comparisons, you may use the log files for a recent [w-2](http://mozilla-releng-blobs.s3.amazonaws.com/blobs/mozilla-inbound/sha512/27983329167951b69f6a451846d0c7e422bb0e589c407141737b40ef21f7a8aaf9347bc57928450fff6e64cc86c72970bb0325dbab258b43284a8008cf3e1885) with the [w-e10s-2](http://mozilla-releng-blobs.s3.amazonaws.com/blobs/mozilla-inbound/sha512/d4372303775a5dfeb2d1d7c44d89a2b1dcb78d9ee2e7859fd6469b9a7518594a905a313f0bc947196bebc9a95f153804cd5344471126fd833a56d5498aa9cc5b) run.

## Contributing
You may refer to the [CONTRIBUTING.md](https://github.com/jgraham/wptview/blob/dcc68d8ffffafc7eca8b080becd825fab5a5d61d/CONTRIBUTING.md) file for further details.

## Contact Us
We are active on the irc.mozilla.org under **#ateam**. Hope to see you there!