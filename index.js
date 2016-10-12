// Note: We use plain JavaScript here which is why none of the new ES2015 features have been used
// Feel free to use Typescript / ES2015 / Babel ...

// get hold of the sdk module
var awsIot = require('aws-iot-device-sdk');

// get hold of the readline module
var readline = require('readline');

// pull in the externalized RaspberryPi configuration
var raspberryPiConfiguration = require('./configuration/raspberrypi.json');

// global token used to track if thing shadow operations are currently being executed (null in that case) 
var opClientToken;

var thingState = {
    "message": "Hello World!"
}

// instantiate the RaspberryPi thing shadow class through which we can communicate
// with the thing shadows of the RaspberryPi
var raspberryPiThingShadows = awsIot.thingShadow(raspberryPiConfiguration);

// register our thing shadow so that we can subscribe to events to it
// Note: if you want to see/modify the thing shadows state at the dashboard make sure
//       to name your thing shadow like you named your device
raspberryPiThingShadows.register(raspberryPiConfiguration.thingName);

// handle the error event posted in case of errors
raspberryPiThingShadows
    .on('error', function (error) {
        console.log('error', error);
    });

// handle the delta event sent in case the thing shadow has been updated externally
// Note: updates to the desired thing shadow state are published using both 'delta' and 'update' events
raspberryPiThingShadows
    .on('delta', function (thingName, stateObject) {
        console.log('received delta on ' + thingName + ': ' + JSON.stringify(stateObject.state));

        // we simply update our state to match the desired one
        // TODO: ideally the states should be merged here
        thingState = stateObject.state

        // we notify the thing shadow about the transition
        opClientToken = raspberryPiThingShadows.update(raspberryPiConfiguration.thingName, {
            state: {
                reported: thingState
            }
        });

        // TODO: handle the update process more robustly
        if (opClientToken === null) {
            console.log('operation in progress');
        }
    });

// handle the timeout event sent in case of timeouts
raspberryPiThingShadows
    .on('timeout', function (thingName, clientToken) {
        console.warn('timeout: ' + thingName + ', clientToken=' + clientToken);

        // TODO: probably a retry would be in order
    });

// handle the status event send in case get/update/delete complete
raspberryPiThingShadows
    .on('status', function (thingName, statusType, clientToken, stateObject) {
        if (statusType === 'rejected') {
            // If an operation is rejected it is likely due to a version conflict;
            // request the latest version so that we synchronize with the thing
            // shadow.  The most notable exception to this is if the thing shadow
            // has not yet been created or has been deleted.
            if (stateObject.code !== 404) {
                console.log('synchronizing the shadow');
                opClientToken = raspberryPiThingShadows.get(thingName);
                if (opClientToken === null) {
                    console.log('operation in progress');
                }
            } else {
                // create the initial state
                raspberryPiThingShadows.update(thingName, {
                    state: {
                        reported: thingState
                    }
                });
            }
        }
        // synchronize the initial state at application startup
        if (statusType === 'accepted' && clientToken === "startup") {
            console.log("syncing latest state", stateObject.state.reported);
            thingState = stateObject.state.reported
        }
    });

// connect to the thing shadows
raspberryPiThingShadows
    .on('connect', function () {
        console.log('connected to AWS IoT...');

        // get the latest state upon connection
        setTimeout(function () {
            opClientToken = raspberryPiThingShadows.get(raspberryPiConfiguration.thingName, "startup");

            if (opClientToken === null) {
                console.log('operation in progress');
            }
        }, 3000);
    });

// make a primitive prompt available after 5 seconds
setTimeout(function () {
    var rl = readline.createInterface(process.stdin, process.stdout);
    rl.setPrompt('message> ');
    rl.prompt();
    rl.on('line', function (line) {
        // set the next desired state
        // Note: desired state updates are typically issued by another application - 
        //       the thing 'just' reports its state
        raspberryPiThingShadows.update(raspberryPiConfiguration.thingName, {
            state: {
                desired: {
                    "message": line
                }
            }
        });

        rl.prompt();
    }).on('close', function () {
        // finish and cleanup upon hitting CTRL+C
        raspberryPiThingShadows.end();
        process.exit(0);
    });
}, 5000);
