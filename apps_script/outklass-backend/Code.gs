var FIREBASE_URL = "FIREBASE_REALTIME_DB_URL";
var PRIVATE_KEY  = "FIREBASE_PRIVATE_KEY";
var CLIENT_EMAIL = 'FIREBASE_SERVICE_ACCOUNT_EMAIL'; // service account email address

var GLIDE_SPREADSHEET_ID = 'GOOGLE_SPREADSHEET_ID_FOR_GLIDE';
var GLIDE_ASSIGNMENTS_SHEET_NAME = 'Classwork';
var GLIDE_COURSES_SHEET_NAME = 'Courses';

var COURSE_ID_COL          = 2;
var COURSE_STUDENT_ID_COL  = 4;
var COURSE_N_COMPLETED_COL = 9;

var ASSIGNMENT_DUE_COL        = 1;
var ASSIGNMENT_STATE_COL      = 2;
var ASSIGNMENT_SUBSTATE_COL   = 3;
var ASSIGNMENT_TITLE_COL      = 4;
var ASSIGNMENT_ID_COL         = 9;
var ASSIGNMENT_STATE_IMG_COL  = 13;
var ASSIGNMENT_LATE_COL       = 14;
var ASSIGNMENT_STUDENT_ID_COL = 15;
var ASSIGNMENT_GRADE_COL      = 17;
var ASSIGNMENT_POINTS_COL     = 18;
var ASSIGNMENT_EMAIL_COL      = 19;
var ASSIGNMENT_CW_UPDATE_COL  = 19;
var ASSIGNMENT_SM_UPDATE_COL  = 20;




function processGlideSheetQueue() {
  
  var service = getFirebaseService();
  if (service.hasAccess()) {
    
    var firebase = FirebaseApp.getDatabaseByUrl(FIREBASE_URL, service.getAccessToken());
    
    // Check the Firebase queue and move data to Glide
    var q = firebase.getData("queue/glideapp-sheet/update/");

    var spreadsheet       = SpreadsheetApp.openById(GLIDE_SPREADSHEET_ID);
    var courses_sheet     = spreadsheet.getSheetByName(GLIDE_COURSES_SHEET_NAME); 
    var assignments_sheet = spreadsheet.getSheetByName(GLIDE_ASSIGNMENTS_SHEET_NAME);    
    var ss_courses_by_student = {};
    var ss_assignments_by_student = {};
    
    var lock = LockService.getScriptLock();
    
    try {
      lock.waitLock(30000);
    } catch (e) {
      Logger.log('Could not obtain lock after 30 seconds.');
      return;
    }

    
    read_courses_from_spreadsheet    (firebase, courses_sheet,     ss_courses_by_student);
    read_assignments_from_spreadsheet(firebase, assignments_sheet, ss_assignments_by_student);
    
    for (var key in q) {
      
      
      if (q[key].courses) {
        var course_id = null;
        for (course_id in q[key].courses) { break; }
        var studentid = q[key].courses[course_id][ COURSE_STUDENT_ID_COL-1 ];
        update_courses_for_user(firebase,courses_sheet,ss_courses_by_student[studentid],key,q[key].courses);
        
      }
      
      if (q[key].assignments) {

        update_assignments_for_user(firebase,assignments_sheet,ss_assignments_by_student[studentid],key,q[key].assignments);
        
      }
    }
    
    SpreadsheetApp.flush();
    lock.releaseLock();


  } else {
    Logger.log('No access: ' + service.getLastError());
  }
}

function delete_from_notify_queue_(firebase,path) {
  if (path.match('^queue/sms/')) {
    firebase.removeData(path);
//    Logger.log('Would delete %s from firebase', path);
  }
}
function delete_from_glideapp_update_queue_(firebase,path) {
  if (path.match('^queue/glideapp-sheet/update/')) {
    firebase.removeData(path);
//    Logger.log('Would delete %s from firebase', path);
  }
}

function read_courses_from_spreadsheet(firebase, sheet, ss_courses_by_student) {
  var range = sheet.getDataRange();
  var ss_courses = range.getValues();
  
  for (var i=1; i<ss_courses.length; i++) {  // skip header row
    
    var ss_course = ss_courses[i];
    var userid = ss_course[COURSE_STUDENT_ID_COL-1];
    
    if (!ss_courses_by_student[ userid ]) { ss_courses_by_student[ userid ] = []; }
    ss_courses_by_student[ userid ].push( { row: i+1, course: ss_course } );
  }
}

function read_assignments_from_spreadsheet(firebase, sheet, ss_assignments_by_student) {
  var range = sheet.getDataRange();
  var ss_assignments = range.getValues();
  
  var assignment    = null;
  var ss_assignment = null;
  for (var i=1; i<ss_assignments.length; i++) {  // skip header row
    
    ss_assignment = ss_assignments[i];
    if (!ss_assignments_by_student[ ss_assignment[ASSIGNMENT_STUDENT_ID_COL-1] ]) {
      ss_assignments_by_student[ ss_assignment[ASSIGNMENT_STUDENT_ID_COL-1] ] = [];
    }
    ss_assignments_by_student[ ss_assignment[ASSIGNMENT_STUDENT_ID_COL-1] ].push( { row: i+1, assignment: ss_assignment } );
  }
}


// TODO For now, we're just going to ADD courses that are missing, and update the # of completed assignments.  No deletes.
function update_courses_for_user(firebase, courses_sheet, ss_courses, userkey, courses) {
  
  for (var course_id in courses) { 

    var found = 0;
    for (var ss_course in ss_courses) {
    
      if (ss_courses[ss_course].course[COURSE_ID_COL-1] == course_id) {

        found = 1;
        
        // check for updates
        if (ss_courses[ss_course].course[COURSE_N_COMPLETED_COL-1] != courses[course_id][COURSE_N_COMPLETED_COL-1]) {
          var cell = courses_sheet.getRange(ss_courses[ss_course].row,COURSE_N_COMPLETED_COL);
              cell.setValue(courses[course_id][ COURSE_N_COMPLETED_COL-1 ]);
        }
        
        break;
      }
    }

    if (!found) {
      add_course(firebase, courses_sheet, courses[course_id]);
    }
  }
  
  delete_from_glideapp_update_queue_(firebase,"queue/glideapp-sheet/update/" + userkey + "/courses");
}

function add_course(firebase, courses_sheet, course) {
  // TODO: batch these
  courses_sheet.appendRow(course);
}


// TODO: For now, we're only going to ADD and UPDATE coursework, not delete it.
function update_assignments_for_user(firebase, assignments_sheet, ss_assignments, userkey, assignments) {
  
  for (var assignment_id in assignments) {
    
    var found = 0;
    if (ss_assignments && ss_assignments.length) {
      for (var i=0; i<ss_assignments.length; i++) {
    
        if (ss_assignments[i].assignment[ASSIGNMENT_ID_COL-1] == assignment_id) {

          found = 1;

          var row = ss_assignments[i].row;        
          var ss_assignment = ss_assignments[i].assignment;
        
          check_assignment_for_state_changes(firebase, assignments_sheet, assignments[assignment_id], ss_assignment, row);
          check_assignment_for_changes(firebase, assignments_sheet, assignments[assignment_id], ss_assignment, row);
 
          break;
        }
      }
    }

    if (!found) {
      add_assignment(firebase, assignments_sheet, assignments[assignment_id]);
    }

  }
  
  delete_from_glideapp_update_queue_(firebase,"queue/glideapp-sheet/update/" + userkey + "/assignments");
}



function check_assignment_for_changes(firebase, assignments_sheet, assignment, ss_assignment, row) {
  
  if ((assignment[ ASSIGNMENT_CW_UPDATE_COL-1 ] != ss_assignment[ ASSIGNMENT_CW_UPDATE_COL-1 ]) ||
      (assignment[ ASSIGNMENT_SM_UPDATE_COL-1 ] != ss_assignment[ ASSIGNMENT_SM_UPDATE_COL-1 ])   ) 
  {

    Logger.log('UPDATE for %s', assignment[ ASSIGNMENT_TITLE_COL-1 ]);
    
    var cell = null;
    for (var col in [ASSIGNMENT_DUE_COL, ASSIGNMENT_LATE_COL, ASSIGNMENT_POINTS_COL, ASSIGNMENT_GRADE_COL]) {
        
      if (assignment[ col-1 ] != ss_assignment[ col-1 ]) {
        
        Logger.log("changing %s,%s to %s", row, col, assignment[ col-1 ]);
        cell = assignments_sheet.getRange(row,col);
        cell.setValue(assignment[ col-1 ]);
        
        if (col == ASSIGNMENT_DUE_COL) {
          update_notifications_with_new_due_date(firebase, assignment);
        }
      }
    }
  
    cell = assignments_sheet.getRange(row,ASSIGNMENT_CW_UPDATE_COL);
    cell.setValue(assignment[ ASSIGNMENT_CW_UPDATE_COL-1 ]);

    cell = assignments_sheet.getRange(row,ASSIGNMENT_SM_UPDATE_COL);
    cell.setValue(assignment[ ASSIGNMENT_SM_UPDATE_COL-1 ]);   
  }
}

function check_assignment_for_state_changes(firebase, assignments_sheet, assignment, ss_assignment, row)
{
  
  if ((assignment[ ASSIGNMENT_STATE_COL-1    ] != ss_assignment[ ASSIGNMENT_STATE_COL-1    ]) ||
      (assignment[ ASSIGNMENT_SUBSTATE_COL-1 ] != ss_assignment[ ASSIGNMENT_SUBSTATE_COL-1 ]))
  { 

    Logger.log('%s: %s', row, assignment[ ASSIGNMENT_TITLE_COL-1 ]);
    Logger.log('state %s vs %s', assignment[ ASSIGNMENT_STATE_COL-1 ], ss_assignment[ ASSIGNMENT_STATE_COL-1 ]);

    // TODO: batch these
    var cell = null;
        cell = assignments_sheet.getRange(row,ASSIGNMENT_STATE_COL);
        cell.setValue(assignment[ ASSIGNMENT_STATE_COL-1 ]);
        cell = assignments_sheet.getRange(row,ASSIGNMENT_SUBSTATE_COL);
        cell.setValue(assignment[ ASSIGNMENT_SUBSTATE_COL-1 ]);
        cell = assignments_sheet.getRange(row,ASSIGNMENT_STATE_IMG_COL);
        cell.setValue(assignment[ ASSIGNMENT_STATE_IMG_COL-1 ]);

        
    // Something was completed! Hooray! Send notification!
    // TODO: Switch to getting notifications via pubsub; this is a SLOW substitute
    if ((assignment[ ASSIGNMENT_STATE_COL-1 ] == 'COMPLETED') && 
        (assignment[ ASSIGNMENT_STATE_COL-1 ] != ss_assignment[ ASSIGNMENT_STATE_COL-1 ]))
    {
      add_completion_notification(firebase, assignment);
    }
  }
}
function add_assignment(firebase, assignments_sheet, assignment) {
  // TODO: batch these
  assignments_sheet.appendRow(assignment);
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
