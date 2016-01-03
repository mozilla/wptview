# wptview
Webapp for displaying the results of web-platform-tests.

## Running wptview
This app runs on a local server. You may set up a local server by using Python's SimpleHTTPServer.

`python -m SimpleHTTPServer 8000`

Go to a browser (use Google Chrome) and visit `localhost:8000`. WPT Viewer should start.

WPT Viewer needs to ingest some web-platform-tests mozlog files to get up and running. A good place to find mozlog files is Mozilla's [Treeherder](https://treeherder.mozilla.org/#/jobs?repo=mozilla-inbound) for mozilla-inbound.
These files are generally found under "Job Details" after clicking a failed job (marked in orange) and have are generally named wpt_raw.log or simply raw.log.

A good log file to testing purposes may be found [here](http://mozilla-releng-blobs.s3.amazonaws.com/blobs/mozilla-inbound/sha512/05a68f7a1acdd9f9c800e587f576083678588c9271d9221878f3cf959063473bc6783ca09c75eacd39990ac037b0b9ec3c806a8e910c74388609fff1be8fe570).

## Contact Us
We are active on the irc.mozilla.org under **#ateam**. Hope to see you there!