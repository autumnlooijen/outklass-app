require('dotenv').config();


const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, 
                                 process.env.TWILIO_AUTH_TOKEN);

var AsyncLock = require('async-lock');
var lock = new AsyncLock({timeout: 5000, maxPending: 1000});

var admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://out-klass.firebaseio.com',
});



// Send the notifications in queue. 
// All notifications will be sent right away.
function handle_sms_queue(which) {
  

    var ref = admin.database().ref('queue/sms/' + which);

    ref.on('child_added', (childSnapshot) => {

      try {
        var childKey = childSnapshot.key;
        var childData = childSnapshot.val();
        if (childData && childData.phone && childData.message) {
          send_sms( childData.phone, childData.message );
          console.debug('    sent ' + childData.message + ' to ' + childData.phone);
          childSnapshot.ref.remove();
        }
      } catch(err) {
        console.debug('    %s', err);
        childSnapshot.ref.set(childKey + '/status', 'failed');
        childSnapshot.ref.set(childKey + '/error', err);
      }
    });
}


function send_sms(to, msg) 
{
  twilio.messages
    .create({
      to:   to,
      from: process.env.TWILIO_FROM,
      body: msg
  })
  .then(message => console.debug(message.sid))
  .catch(function (error) {
    console.log(error);
  });
}


// BUG: If it's already complete we don't need to send another sms
function handle_assignment_completion(studentId, assignmentId) {

  lock.acquire("queue/sms/" + studentId + assignmentId, function() {

    // mark assignment as done
    var assignmentRef = admin.database().ref("users/" + studentId + '/assignments/' + assignmentId);
    assignmentRef.child('status').set('COMPLETED');



    // update n_done_today
    // BUG: doesn't handle time zones
    //      It needs to operate in the user's time zone
    //      ...so we need to store tz at some point
    var now = new Date(),
      today = new Date( now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    admin.database().ref("users/" + studentId + '/assignments/').orderByChild("dueTime").startAt(today.getTime()).once('value').then(function(snap) {

      // recalculate n_due counter
      var n_due = 0;
      var n_done = 0;
      snap.forEach(function(assignment) {
        n_due++;
        if (assignment.child('status').val() == 'COMPLETED') {
          n_done++;
        }
      });
      snap.ref.parent.child('info').child('n_due_today' ).set(n_due);
      snap.ref.parent.child('info').child('n_done_today').set(n_done);
    });


    var infoRef = admin.database().ref("users/" + studentId + "/info") || null;
    infoRef.once('value').then(function (snap) {
      var phone = snap.child('phone');

      if (phone) {
        var msg = "Assignment complete!";
    
        // Add completion stats, if they're working on today's work
        // (Technically this will still add stats in the case where
        // they are doing yesterday's work but also did some of today's work
        // ...but I think that's fine.  We just want to avoid giving stats
        // where #due is 0 (because it's weird) or #done is 0 (because it's demotivating))
        var n_due  = snap.child('n_due_today').val();
        var n_done = snap.child('n_done_today').val();
        if (n_due > 0 && n_done > 0) {
          msg = msg + " " + n_done + "/" + n_due + " done today";
        }
        
        var ref = admin.database().ref('queue/sms/assignment-done');
        ref.push({studentId: studentId, assignmentId: assignmentId, phone: phone.val(), message: msg});
      }

    });

  });
}


//handle_assignment_completion("115120693938782307553", "122725683679");
//handle_sms_queue('assignment-done');
