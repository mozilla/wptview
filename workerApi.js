function messageAdapter(service) {
  return function(event) {
    var msg_id = event.data[0];
    var cmd = event.data[1];
    var data = event.data[2];

    console.log(service.constructor.name + " got command " + cmd);

    service[cmd].apply(service, data)
      .then((resp) => {console.log("Got result for command " + cmd); return resp})
      .then((resp) => postMessage([msg_id, resp]));
  }
}