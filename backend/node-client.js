require('dotenv').config();


const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, 
                                 process.env.TWILIO_AUTH_TOKEN);


var AsyncLock = require('async-lock');
var lock = new AsyncLock({timeout: 5000, maxPending: 1000});


var admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'DATABASE_URL',
});

var ref = admin.database().ref();


// print the data from the database, for testing
/*
ref.once("value")
 .then(function (snap) {
 console.log("snap.val()", snap.val());
 });
*/


// Send the notifications in queue. 
// All notifications will be sent right away.
function processNotificationsQueue() {
  
    // For now we lock the whole queue.  Because it's Good Enough.
    lock.acquire("queue/notify/sms", function() {

console.log('got the lock');
/*
    ref // use DB ref from new firebase library
    var q = firebase.getData("queue/notify/sms/unsent/");

    for (var key in q) {    

      if (q[key].message && q[key].phone) {
        try {
          var msg = q[key].message;
          var to  = q[key].phone;

          var response_data = send_sms( to, msg );
          console.log('    sent ' + msg + ' to ' + to);
          delete_from_notify_queue_(firebase, "queue/notify/sms/unsent/" + key);
          firebase.setData("queue/notify/sms/sent/" + key, q[key]);

        } catch(err) {
          console.log('    %s', err);
          delete_from_notify_queue_(firebase, "queue/notify/sms/unsent/" + key);
          firebase.setData("queue/notify/sms/error/" + key, q[key]);
        }
      }
    }
*/

        }).catch(function(err) {
          console.log(err.message);
        });
console.log("released lock");

}


function send_sms(to, msg) 
{
  twilio.messages
    .create({
      to:   to,
      from: process.env.TWILIO_FROM,
      body: msg
  })
  .then(message => console.log(message.sid))
  .catch(function (error) {
    console.log(error);
  });
}

processNotificationsQueue();
