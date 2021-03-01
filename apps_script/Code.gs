var Globals = PropertiesService.getScriptProperties().getProperties();

if (!ScriptProperties.getProperty('appUrl')) {
  ScriptProperties.setProperties( {
    
    appUrl: 'URL_WE_SHOULD_LINK_AT_BOTTOM_OF_TEXT_MESSAGES',
    
    grayImg     : 'https://drive.google.com/file/d/14rrCl7jPZJ8JvXmSDtyh_xO3yeNvwbHJ/view?usp=sharing',
    redImg      : 'https://drive.google.com/file/d/10rOnfitthVzIkwBLSoGPRPrrH3JFs-dO/view?usp=sharing',
    deepRedImg  : 'https://drive.google.com/file/d/17IAN9JYfzL1leVIO2IGDyPlgoekB7p7G/view?usp=sharing',
    yellowImg   : 'https://drive.google.com/file/d/1Kn2I16HJkeAivZ08fzUODVfheDn-wNYl/view?usp=sharing',
    orangeImg   : 'https://drive.google.com/file/d/1vIxxm00eWPg20c1Y-hyFtbIq4vfe46tL/view?usp=sharing',
    greenImg    : 'https://drive.google.com/file/d/19kGGl9CTklMx3Cm92ILpP9Qc9InxIQGB/view?usp=sharing',
    deepGreenImg: 'https://drive.google.com/file/d/1QENkSraHZbi83LJm5SvUOn6aqwizc5jE/view?usp=sharing'
    
  });
}

var FIREBASE_URL = "FIREBASE_URL";
var PRIVATE_KEY  = "FIREBASE_PRIVATE_KEY";
var CLIENT_EMAIL = 'FIREBASE_SERVICE_ACCOUNT_EMAIL'; // service account email address


function doGet(e) {
  
  var html = '<p>Loading classwork... ';
  var service = getFirebaseService();
  if (service.hasAccess()) {
    
    html += "connecting to database... ";
    var firebase = FirebaseApp.getDatabaseByUrl(FIREBASE_URL, service.getAccessToken());

    html += "calculating dates... ";    
    set_reference_dates();  // used in calculating this week's assignments
    
    
    // Contact the Google Classroom API and store the assignments in firebase
    html += "talking to Google Classroom... ";
    update_coursework();
    html += "...done!";

  } else {
    Logger.log('No access: ' + service.getLastError());
  }
 
  return HtmlService.createHtmlOutput(html);
}


/**
 * Configures the service.
 */
function getFirebaseService() {
  return OAuth2.createService('Firebase')
      .setTokenUrl('https://accounts.google.com/o/oauth2/token')
      .setPrivateKey(PRIVATE_KEY)
      .setIssuer(CLIENT_EMAIL)
      .setScope('https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database')

      // Authorized tokens should be persisted in this property store.
      .setPropertyStore(PropertiesService.getScriptProperties());
}




/**
 * Reset the authorization state, so that it can be re-tested.
 */
/*
function reset() {
  var service = getFirebaseService();
  service.reset();
}
*/

/*
// Used to replace all students currently in firebase with the new set of students from the Google sheet, for testing
function loadNewStudents_() {
  var ss = SpreadsheetApp.openById('1B9drrw4hJ0MO5bV89VexhABuDSmC72p0K8p-sNzKoDo');
  var sheet = ss.getSheetByName('Students');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    
    var data = {googleClassroomId: rows[i][0], email: rows[i][1], name: rows[i][2], phone: rows[i][3], grade: rows[i][4], prefs:{defaultView: rows[i][5], courseTimeframe: rows[i][16] || 'This week'}};

    newStudent(data['email'].replace(/\./g, ','), data);
  }
}

function updateStudents() {
  var ss = SpreadsheetApp.openById('1B9drrw4hJ0MO5bV89VexhABuDSmC72p0K8p-sNzKoDo');
  var sheet = ss.getSheetByName('Students');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    
    var data = {googleClassroomId: rows[i][0], email: rows[i][1], name: rows[i][2], phone: rows[i][3], grade: rows[i][4], prefs:{defaultView: rows[i][5], courseTimeframe: rows[i][16] || 'This week'}};

    updateStudent(data['email'].replace(/\./g, ','), data);
  }
}
*/
  
function newUser(username, data) {
  
  Logger.log(data);

  var service = getFirebaseService();
  if (service.hasAccess()) {
    var firebase = FirebaseApp.getDatabaseByUrl(FIREBASE_URL, service.getAccessToken());
    firebase.setData("users/" + username, data);
  } else {
    Logger.log('No access: ' + service.getLastError());
  }
  
}

function updateUser(username, data) {
  
  Logger.log(data);

  var service = getFirebaseService();
  if (service.hasAccess()) {
    var firebase = FirebaseApp.getDatabaseByUrl(FIREBASE_URL, service.getAccessToken());
    firebase.updateData("users/" + username, data);
  } else {
    Logger.log('No access: ' + service.getLastError());
  }
  
}



function newStudent(username, data) {
    
  if (null != data['phone']) { data['phone'] = canonical_us_phone_number_(data['phone']); }
  data['username'] = username;
  data['type'] = 'STUDENT';
  if (null == data['prefs']) { data['prefs'] = {defaultView: 'To-do', courseTimeframe: 'This week'}; }
 
  return newUser(username, data);
}

function updateStudent(username, data) {
    
  if (null != data['phone']) { data['phone'] = canonical_us_phone_number_(data['phone']); }
  data['username'] = username;
  data['type'] = 'STUDENT';
  if (null == data['prefs']) { data['prefs'] = {defaultView: 'To-do', courseTimeframe: 'This week'}; }
 
  return updateUser(username, data);
}

/*
function newParent(username, data) {
    
  if (null != data['phone']) { data['phone'] = canonical_us_phone_number_(data['phone']); }
  data['username'] = username;
  data['type'] = 'PARENT';
  if (null == data['prefs']) { data['prefs'] = {defaultView: 'To-do', courseTimeframe: 'This week'}; }
 
  return newUser(username, data);
}
*/


function updateGoogleClassroomId(username, googleClassroomId) {
        
  if (googleClassroomId.match(/^\d+$/) && ref.get("users/user-${username}/googleClassroomId") == 'STUDENT') {
    firebase.updateData({"users/user-${username}/googleClassroomId": "${googleClassroomId}"});
  } else {
    Logger.log("Can't save google classroom id [${googleClassroomId}] for user-${username}; must be numeric.");
  }
}
function updateGrade(username, grade) {

  firebase.updateData({"users/user-${username}/grade": "${grade}"});
}
function updateName(username, name) {
        
  if (null != name) {
    firebase.updateData({"users/user-${username}/name": "${name}"});
  } else {
    Logger.log("Can't save name [${name}] for user-${username}; a name is required.");
  }
}
function updateEmail(username, email) {
        
  if (null != email && email.match(/\@/)) {
    firebase.updateData({"users/user-${username}/email":  "${email}"});
  } else {
    Logger.log("Can't save email [${email}] for user-${username}; invalid email address.");
  }
}
function updatePhone(username, phone) {
      
  var p  = canonical_us_phone_number_(phone);
  
  if (null != p) {
    firebase.updateData({"users/user-${username}/phone":  "${p}"});
  } else {
    Logger.log("Can't save phone number [${phone}] for user-${username}; it doesn't look like a US phone number (ie it needs 10 digits.");
  }
}




function canonical_us_phone_number_(phone) {
  
  phone = phone + '';
  var p = phone.replace(/\D/g,'').replace(/^1/,'');
  
  if (p.match(/^\d{10}$/)) { return p; }
      
  return null;
}



/**
 * Get the user's classwork from the Google API and store it in firebase
 */
function update_coursework() {
  var r = Classroom.Courses.list({pageSize: 20, studentId: 'me', courseStates: ['ACTIVE']});
  
  var courseWork = {};
  var studentSubmissions = {};
  var courses = [];
  var studentId = null;

  if (r.courses && r.courses.length > 0) {
    for (var i in r.courses) {

      // grab up to 200 assignments for this course, and hash them
      var cwr = Classroom.Courses.CourseWork.list(r.courses[i].id, {pageSize: 200});  
      if (cwr.courseWork && cwr.courseWork.length > 0) {

        for (var k in cwr.courseWork) {
          courseWork[ cwr.courseWork[k].id ] = cwr.courseWork[k];
        }
      }     
      
      // grab up to 200 student submissions for this course, and process them
      var completed = 0;
      var this_week = 0;
      var completed_this_week = 0;
      var ssr = Classroom.Courses.CourseWork.StudentSubmissions.list(r.courses[i].id, '-', {pageSize: 200, userId: 'me'});
      if (ssr.studentSubmissions && ssr.studentSubmissions.length > 0) {

        if (!studentId && ssr.studentSubmissions[0].userId) { studentId = ssr.studentSubmissions[0].userId; }

        var state = '';
        for (var j in ssr.studentSubmissions) {
          
          // fill in the assignment's state
          var r = get_status(courseWork[ssr.studentSubmissions[j].courseWorkId], ssr.studentSubmissions[j]);
          ssr.studentSubmissions[j].state       = r.state;
          ssr.studentSubmissions[j].subState    = r.subState;
          ssr.studentSubmissions[j].statusColor = r.statusColor;
          ssr.studentSubmissions[j].statusImage = r.statusImage;
          
          studentSubmissions[ ssr.studentSubmissions[j].courseWorkId ] = ssr.studentSubmissions[j];
          
          var state = ssr.studentSubmissions[j].state;
          if (state == 'TURNED_IN' || state == "RETURNED") { completed++; }
          
          if (due_this_week(courseWork[ssr.studentSubmissions[j].courseWorkId].dueDate)) { 
            this_week++;
            if (state == 'TURNED_IN' || state == "RETURNED") { completed_this_week++; }
          }
        
          

          // Store the assignments in firebase
          var DESC_LEN = 50;
          firebase.setData("users/" + studentId + "/assignments/" + cw.id, 
                           { id: cw.id, 
                             title: cw.title, 
                             description: cw.description.substring(0,DESC_LEN),
                             due: cw.d.getTime(),
                             late: ss.late,
                             status: ss.state,
                             subStatus: ss.subState,
                             statusImg: ss.statusImage,
                             submissionId: ss.id,
                             submissionLink: ss.alternateLink,
                             maxPoints: cw.maxPoints, 
                             earnedPoints: ss.assignedGrade, 
                             lastUpdateSubmission: ss.updateTime,
                             studentId: studentId
                           });
          firebase.setData("assignments/" + cw.id, 
                           { id: cw.id, 
                             assigned: cw.creationTime, 
                             title: cw.title, 
                             description: cw.description,
                             due: cw.d.getTime(),
                             courseId: cw.courseId, 
                             courseLink: r.courses[i].alternateLink,
                             assignmentLink: cw.alternateLink, 
                             maxPoints: cw.maxPoints,                            
                             lastUpdateAssignment: cw.updateTime 
                           });
        
          // ...and enqueue a sync to the google spreadsheet that powers the no-code app (and is SO going to melt once we have traffic)
          // Classwork tab in Google Sheets has these headers; store data for Google sheet in the same format we'll want it for the sheet:
          // Due Date	Status	Status Detail	Assignment Name	Assigned Date	Course	Course ID	Link to Course	Assignment ID	Link to Assignment	Student Work ID	Link to Student Work	Status Image	Late	Student ID	Description	Grade	Max Points	Last Update Coursework	Last Update Submission	E-mail	Ignore	Status_new	CourseXStudent			
          var ss = ssr.studentSubmissions[j];
          var cw = courseWork[ss.courseWorkId];
          firebase.setData("queue/glideapp-sheet/update/classwork/" + ss.courseWorkId, 
                           [ ss.d, ss.state, ss.subState, cw.title, cw.creationTime, cw.courseId,  r.courses[i].alternateLink,  cw.id, cw.alternateLink, ss.id, ss.alternateLink, ss.statusImage, ss.late, studentId, cw.description, ss.assignedGrade, cw.maxPoints, cw.updateTime, ss.updateTime, null, null, null, "" + cw.courseId + studentId  ]
                           );

        }
      }
      
      
      // Course tab in Google Sheets has these headers; store data for Google sheet in the same format we'll want it for the sheet:
      // Courseename	CourseID	Linktocourse	StudentID	Studentemail	CourseXStudent	🔒 Row ID	Assign_all-time	Comple_all-time	Comple_all-time%	Assign_this-week	Complete_this-week	Comple_this-week%															
      courses[i] = 
        firebase.setData("queue/glideapp-sheet/update/courses/" + r.courses[i].id, 
                         [ r.courses[i].name, r.courses[i].id, r.courses[i].alternateLink, studentId, null, "" + r.courses[i].id + studentId, null, j, completed, null, this_week, completed_this_week, null ]
        );
        
    }
    

  } else {
    Logger.log('No courses found.');
  }
}




/* Functions for calculating when assignments are due
 *
 * due_within_3_hours(dueDate)
 * due_today(dueDate)
 * due_this_week(dueDate)
 * due_last_week(dueDate)
 *
 */
function set_reference_dates(cutoffHours = 8, cutoffMinutes = 30) {

  Globals.now = new Date();
  Globals.three_hours_from_now = new Date();
  Globals.three_hours_from_now.setTime(Globals.three_hours_from_now.getTime() + (3*60*60*1000));
  
  Globals.today = new Date();
  Globals.today.setHours(0, 0, 0, 0);
  
  Globals.todayCutoff = new Date();
  Globals.todayCutoff.setHours(cutoffHours, cutoffMinutes, 0, 0);
  
  Globals.tomorrowCutoff = new Date();
  Globals.tomorrowCutoff.setDate(Globals.todayCutoff.getDate() + 1);
  Globals.tomorrowCutoff.setHours(cutoffHours, cutoffMinutes, 0, 0);

  Globals.thisMonday = new Date();
  Globals.thisMonday.setDate( Globals.today.getDate() - ((Globals.today.getDay()+6) % 7) );
  Globals.thisMonday.setHours(0, 0, 0, 0);
  Globals.lastMonday = new Date(Globals.thisMonday);
  Globals.lastMonday.setDate( Globals.thisMonday.getDate() - 7 );
  Globals.nextMonday = new Date(Globals.thisMonday);
  Globals.nextMonday.setDate( Globals.thisMonday.getDate() + 7 );
  
}
function due_within_3_hours(dueDate) {
  if (dueDate >= Globals.now && dueDate < Globals.three_hours_from_now) { return true; }
  return false;
}
function due_today(dueDate) {
  if (dueDate >= Globals.today && dueDate < Globals.tomorrowCutoff) { return true; }
  return false;
}
function due_this_week(dueDate) {
  if (dueDate >= Globals.thisMonday && dueDate < Globals.nextMonday) { return true; }
  return false;
}
function due_last_week(dueDate) {
  if (dueDate >= Globals.lastMonday && dueDate < Globals.thisMonday) { return true; }
  return false;
}

function is_unfinished_and_late_(sm)
{
  if (sm && sm.state != 'TURNED_IN' && sm.state != 'RETURNED' && sm.late) { return true; }
  return false;
  
}

function is_unfinished_(sm)
{
  if (sm && sm.state != 'TURNED_IN' && sm.state != 'RETURNED') { return true; }
  return false; 
}

function formatDate_(d){
  return d ? d.toDateString() + ' ' + d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', hour12: true}) : d;
}

function get_status(cw,sm) {
  
  // get status (and color code the status cell, just for fun)
  var r = {};
  var state = sm.state;
  var subState = '';
  var statusColor = '#00ff00';  // green
  var statusImage = Globals.darkGreenImg;
  
  var d;
  if (cw.dueDate && !cw.d) {
    cw.d = new Date(Date.UTC(cw.dueDate.year, cw.dueDate.month-1, cw.dueDate.day, cw.dueTime.hours || 0, cw.dueTime.minutes || 0));
  }
  
  if (is_unfinished_(sm)) {
    
    if (!cw.dueDate) { 
      state = 'UNKNOWN DUE DATE'; 
      statusColor = '#cccccc'; 
      statusImage = Globals.grayImg; 
    }
    else if (cw.d < Globals.now) {
      
      state = 'OVERDUE'; 
      
      if      (due_this_week_(cw.d)) { subState = 'This week';        statusColor = '#ffaa00';  statusImage = Globals.orangeImg;  } 
      else if (due_last_week_(cw.d)) { subState = 'Last week';        statusColor = '#ff0000';  statusImage = Globals.redImg;     } 
      else                           { subState = 'Before last week'; statusColor = '#cc0000';  statusImage = Globals.deepRedImg; }
    }
    else {
      
      state = 'CURRENT'; 
      
      if      (due_within_3_hours_(cw.d)) { subState = 'Today';           statusColor = '#ffff00';  statusImage = Globals.yellowImg;    }
      else if (due_today_(cw.d)         ) { subState = 'Today';           statusColor = '#00ff00';  statusImage = Globals.greenImg;     }
      else if (due_this_week_(cw.d)     ) { subState = 'This week';       statusColor = '#00cc00';  statusImage = Globals.deepGreenImg; }
      else                                { subState = 'After this week'; statusColor = '#00cc00';  statusImage = Globals.deepGreenImg; }
    }
  }
  else {
    //Logger.log('%s is finished, id %s', cw.title, cw.id);
    
    if (state == 'TURNED_IN' || state == 'RETURNED') { state = 'COMPLETED'; }
    else                                             { Logger.log('%s:  funny state %s', cw.title, state); }

    var ts = sm.updateTime;
    var completionDate = ts ? new Date(ts) : new Date();  // default to completed NOW
    
    // Note: the completionDate is currently the last update time, which changes when the assignment is graded...
    if      (completed_today_(completionDate))            { subState = "This week";        statusColor = '#00ff00';  statusImage = CRGlobals.greenImg; }
    else if (completed_this_week_(completionDate))        { subState = "This week";        statusColor = '#00ff00';  statusImage = CRGlobals.greenImg; }
    else if (completed_last_week_(completionDate))        { subState = "Last week";        statusColor = '#00ff00';  statusImage = CRGlobals.greenImg; }
    else if (completed_before_last_week_(completionDate)) { subState = "Before last week"; statusColor = '#00ff00';  statusImage = CRGlobals.greenImg; }
    else                                                  { Logger.log('%s due %s:  not caught by if/else?', cw.title, ts); }
    
    if (sm.late) { statusColor = '#ffaa00';  statusImage = CRGlobals.orangeImg; }
  }
  
  r.state = state;
  r.subState = subState;
  r.statusColor = statusColor;
  r.statusImage = statusImage;
  
  return r;
}

