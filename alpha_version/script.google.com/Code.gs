var ScriptProperties = PropertiesService.getScriptProperties();

if (!ScriptProperties.getProperty('appUrl')) {
  ScriptProperties.setProperties( {
    
    appUrl: 'URL_WE_SHOULD_LINK_AT_BOTTOM_OF_TEXT_MESSAGES',
    
    grayImg     : 'https://drive.google.com/file/d/14rrCl7jPZJ8JvXmSDtyh_xO3yeNvwbHJ/view?usp=sharing',
    redImg      : 'https://drive.google.com/file/d/10rOnfitthVzIkwBLSoGPRPrrH3JFs-dO/view?usp=sharing',
    deepRedImg  : 'https://drive.google.com/file/d/17IAN9JYfzL1leVIO2IGDyPlgoekB7p7G/view?usp=sharing',
    yellowImg   : 'https://drive.google.com/file/d/1Kn2I16HJkeAivZ08fzUODVfheDn-wNYl/view?usp=sharing',
    orangeImg   : 'https://drive.google.com/file/d/1vIxxm00eWPg20c1Y-hyFtbIq4vfe46tL/view?usp=sharing',
    greenImg    : 'https://drive.google.com/file/d/19kGGl9CTklMx3Cm92ILpP9Qc9InxIQGB/view?usp=sharing',
    deepGreenImg: 'https://drive.google.com/file/d/1QENkSraHZbi83LJm5SvUOn6aqwizc5jE/view?usp=sharing',
    
    // Make a copy of this spreadsheet and put the ID below:
    // https://docs.google.com/spreadsheets/d/1wttJs-UoTqZsajJdqtgsJzPOanGZiz_ecJ_680vJ_EM/edit?usp=sharing
    spreadsheetId: 'ID_OF_YOUR_GOOGLE_SPREADSHEET'
  });
  
  // create the trigger to automatically update the info from Google Classroom
  create_triggers_();  
}
var CRGlobals = PropertiesService.getScriptProperties().getProperties();

CRGlobals.DUE_COL             = 1;
CRGlobals.STATUS_COL          = 2;
CRGlobals.STATUS_DETAIL_COL   = 3;
CRGlobals.TITLE_COL           = 4;
CRGlobals.ASSIGNMENT_ID_COL   = 9;
CRGlobals.ASSIGNMENT_LINK_COL = 10;
CRGlobals.TRAFFIC_LIGHT_COL   = 13;
CRGlobals.LATE_COL            = 14;
CRGlobals.STUDENT_ID_COL      = 15;
CRGlobals.GRADE_COL           = 17;
CRGlobals.POINTS_COL          = 18;
CRGlobals.LAST_CW_UPDATE_COL  = 19;
CRGlobals.LAST_SM_UPDATE_COL  = 20;
CRGlobals.NOTIFY_STUDENT_COL = 1;
CRGlobals.NOTIFY_CW_COL      = 2;
CRGlobals.NOTIFY_STATUS_COL  = 3;
CRGlobals.NOTIFY_TIME_COL    = 4;
CRGlobals.NOTIFY_MSG_COL     = 5;
CRGlobals.NOTIFY_TYPE_COL    = 6;
CRGlobals.STUDENTS_ID_COL             = 1;
CRGlobals.STUDENTS_PHONE_COL          = 4;
CRGlobals.STUDENTS_PCT_COMPLETE_W_COL = 9;
CRGlobals.STUDENTS_N_COMPLETE_D_COL   = 14;
CRGlobals.STUDENTS_PCT_COMPLETE_D_COL = 15;



function addAssignmentToSpreadsheet_(cw, sm) {

  if (!sm) { sm = {}; }  // Sometimes the student submission doesn't exist

  var r = get_status_(cw,sm);
  sm.state       = r.state;
  sm.subState    = r.subState;
  sm.statusColor = r.statusColor;
  sm.statusImage = r.statusImage;
  
  add_new_assignment_to_spreadsheet_(cw,sm);
}



function hardRefreshCourseworkSpreadsheet() {
  updateCourseworkInSpreadsheet_('Classwork', 'Notifications', true);
}

function hardRefreshCourseworkTestSpreadsheet() {
  updateCourseworkInSpreadsheet_('Classwork Test', 'Notifications Test', true);
}
function updateCourseworkTestSpreadsheet() {
  updateCourseworkInSpreadsheet_('Classwork Test', 'Notifications Test');
}
function updateCourseworkSpreadsheet() {
  updateCourseworkInSpreadsheet_('Classwork', 'Notifications');
}

function updateCourseworkInSpreadsheet_(classworkSheetName = 'Classwork', notifySheetName = 'Notifications', hardRefresh = false) {
  
  CRGlobals.ss           = SpreadsheetApp.openById(CRGlobals.spreadsheetId);
  CRGlobals.sheet        = CRGlobals.ss.getSheetByName(classworkSheetName);
  CRGlobals.archiveSheet = CRGlobals.ss.getSheetByName('Archived Classwork');
  CRGlobals.notifySheet  = CRGlobals.ss.getSheetByName(notifySheetName);

  if (hardRefresh) {
    // Clear the data while leaving headers and formulae in place
    var range = CRGlobals.sheet.getRange(2,1,CRGlobals.sheet.getMaxRows()-1, CRGlobals.sheet.getMaxColumns());
    var formulas = range.getFormulas();
    range.clearContent();
    range.setFormulas(formulas);

    // just clear the whole darn thing
    CRGlobals.notifySheet.clear();
    add_headers_to_notify_spreadsheet_();
  }
  set_reference_dates_();
  hash_coursework_();  // also sets CRGlobals.studentId

  CRGlobals.firstRow = CRGlobals.sheet.getMaxRows() + 1;
  
  update_classwork_in_spreadsheet_();
}
function update_classwork_in_spreadsheet_() {

  // Go through the spreadsheet line by line.
  // - update state if it has changed (check CRGobals.studentSubmissions)
  // Add / update / delete assignments
  // Handle notifications for new / deleted coursework
  // TODO: FOR NOW, populate notifications for completed assignments -- later we will do them via pubsub

  
  // TODO: Need just the slice of the spreadsheet where the student ID is   CRGlobals.studentId
  // (do we need to use slice or filter?)
  var range = CRGlobals.sheet.getDataRange();
  var assignments = range.getValues();
  var nDeleted = 0;
  CRGlobals.deleted = {};
  for (var i=1; i<assignments.length; i++) {  // skip header row
    
    // Skip assignments for other people!  
    if (assignments[i][ CRGlobals.STUDENT_ID_COL-1 ] != CRGlobals.studentId) { continue; }
      
    var id = assignments[i][ CRGlobals.ASSIGNMENT_ID_COL-1 ];

    if (!CRGlobals.courseWork[id]) {  // REMOVED from Google Classroom; move to Archived Classwork

      //Logger.log('Archived line %s (%s)', i+1, assignments[i][ CRGlobals.TITLE_COL-1 ]);
      CRGlobals.archiveSheet.appendRow(assignments[i]);
      CRGlobals.sheet.deleteRow(i+1);  // 1-indexed
      nDeleted++;
      
      remove_notifications_(id);
    }
    else {
      // Possible UPDATE
      // BUG: we only check [due date, late, status, maxPoints, grade] for updates; everything else is ignored
      
      // Check for changes to STATE and SUBSTATE
      var r = get_status_(CRGlobals.courseWork[id],CRGlobals.studentSubmissions[id]);
      
      CRGlobals.studentSubmissions[id].state       = r.state;
      CRGlobals.studentSubmissions[id].subState    = r.subState;
      CRGlobals.studentSubmissions[id].statusColor = r.statusColor;
      CRGlobals.studentSubmissions[id].statusImage = r.statusImage;
    
      
      if (assignments[i][ CRGlobals.STATUS_COL-1 ] != r.state) { 

        Logger.log('%s: %s', i+1, CRGlobals.courseWork[id].title);
        Logger.log('state %s vs %s', r.state, assignments[i][ CRGlobals.STATUS_COL-1 ]);

        cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.STATUS_COL);
        cell.setValue(r.state);
        cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.TRAFFIC_LIGHT_COL);
        cell.setValue(r.statusImage);

        
        // Something was completed! Hooray! Send notification!
        if (r.state == 'COMPLETED') {
          add_completion_notification_(CRGlobals.courseWork[id]);
        }
      }
      if (assignments[i][ CRGlobals.STATUS_DETAIL_COL-1 ] != r.subState) { 
        
        Logger.log('%s: %s', i+1, CRGlobals.courseWork[id].title);
        Logger.log('substate %s vs %s', r.subState, assignments[i][ CRGlobals.STATUS_DETAIL_COL-1 ]);

        cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.STATUS_DETAIL_COL);
        cell.setValue(r.subState);
        cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.TRAFFIC_LIGHT_COL);
        cell.setValue(r.statusImage);
      }

      

      if ((assignments[i][ CRGlobals.LAST_CW_UPDATE_COL-1 ] != CRGlobals.courseWork[id].updateTime) ||
          (assignments[i][ CRGlobals.LAST_SM_UPDATE_COL-1 ] != CRGlobals.studentSubmissions[id].updateTime)) {

        Logger.log('UPDATE for %s ("%s" vs "%s")', CRGlobals.courseWork[id].title, assignments[i][ CRGlobals.LAST_SM_UPDATE_COL-1 ], CRGlobals.studentSubmissions[id].updateTime);
        

        var newDueDate = CRGlobals.courseWork[id].d ? formatDate_(CRGlobals.courseWork[id].d) : '';
        var cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.DUE_COL);
        if (newDueDate != cell.getValue()) {
          Logger.log('due date %s vs %s', newDueDate, cell.getDisplayValue());
          cell.setValue(newDueDate);
          Logger.log('  ...updating notifications');
          update_notifications_(CRGlobals.courseWork[id]);
        }        
        // Check for changes to LATE flag
        if (!CRGlobals.studentSubmissions[id].late) { CRGlobals.studentSubmissions[id].late = ''; }
        if (CRGlobals.studentSubmissions[id].late != assignments[i][ CRGlobals.LATE_COL-1 ]) {
          cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.LATE_COL);
          Logger.log('late flag %s vs %s', CRGlobals.studentSubmissions[id].late, cell.getValue());
          cell.setValue(CRGlobals.studentSubmissions[id].late);
        }
        // Check for changes to POINTS
        if (!CRGlobals.courseWork[id].maxPoints) { CRGlobals.courseWork[id].maxPoints = ''; }
        if (CRGlobals.courseWork[id].maxPoints != assignments[i][ CRGlobals.POINTS_COL-1 ]) {
          cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.POINTS_COL);
          Logger.log('points %s vs %s', CRGlobals.courseWork[id].maxPoints, cell.getValue());
          cell.setValue(CRGlobals.courseWork[id].maxPoints);
        }
        // Check for changes to GRADE
        if (!CRGlobals.studentSubmissions[id].grade) { CRGlobals.studentSubmissions[id].grade = ''; }
        if (CRGlobals.studentSubmissions[id].grade != assignments[i][ CRGlobals.GRADE_COL-1 ]) {
          cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.GRADE_COL);
          Logger.log('grade %s vs %s', CRGlobals.studentSubmissions[id].grade, cell.getValue());
          cell.setValue(CRGlobals.studentSubmissions[id].grade);
        }
        
        // Also update the last update times, haha.  So we don't have to revisit this every time.
        cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.LAST_CW_UPDATE_COL);
        cell.setValue(CRGlobals.courseWork[id].updateTime);
        cell = CRGlobals.sheet.getRange(i+1-nDeleted,CRGlobals.LAST_SM_UPDATE_COL);
        cell.setValue(CRGlobals.studentSubmissions[id].updateTime);
      }
    }
    
    delete CRGlobals.courseWork[id];
  }
  
  // Anything left in CRGlobals.courseWork is a new assignment; add it.
  
  for(id in CRGlobals.courseWork) {
    
    Logger.log("New assignment %s", CRGlobals.courseWork[id].title);
    
    addAssignmentToSpreadsheet_(CRGlobals.courseWork[id], CRGlobals.studentSubmissions[id])

  }
  
}


function update_notifications_(cw) {
  remove_notifications_(cw.id);
  add_notifications_(cw);
}

function add_notifications_(cw) {
  
  var now = new Date();
  
  var msg = '';
  var courseName = CRGlobals.courses[cw.courseId].name;
  
  var first_three_words = /^([^ ]+ [^ ]+ [^ ]+) (.*)$/;
  if (courseName.match(first_three_words)) {
      courseName = courseName.replace(first_three_words,"$1");
  }
  Logger.log('adding notification for %s', courseName);
  var tinyurl = get_assignment_tinyurl_(cw.id);
  var d = new Date(cw.d);
  d.setHours(d.getHours() - 1);
  if (d > now) {
    msg = `1h left for ${courseName} assignment.\n${tinyurl}`;
    CRGlobals.notifySheet.appendRow([CRGlobals.studentId, cw.id, 'UNSENT', d, msg, 'Reminder']);
  }
  
  d = new Date(cw.d);
  d.setHours(d.getHours() - 3);
  if (d > now) {
    msg = `3h left for ${courseName} assignment.\n${tinyurl}`;
    CRGlobals.notifySheet.appendRow([CRGlobals.studentId, cw.id, 'UNSENT', d, msg, 'Reminder']);  // 3h before
  }

  d = new Date(cw.d);
  d.setMinutes(d.getMinutes() + 15);
  if (d > now) {
    msg = `${courseName} assignment is overdue.\n${tinyurl}`;
    CRGlobals.notifySheet.appendRow([CRGlobals.studentId, cw.id, 'UNSENT', d, msg, 'Reminder']);  // 15m overdue
  }
}
function add_completion_notification_(cw) {
  
  if (cw && cw.id) {
    
    if (!CRGlobals.now) { CRGlobals.now = new Date(); }

    var courseName   = get_course_name_(cw);
    
    // space at the end is a hack so we can pull the latest completion % when we send the notification.
    // Although, maybe we don't need that hack anymore, since we're only including completion % in the 'assignment complete' SMS.  Hmm...
    var msg = `${courseName} assignment done! 👍`;  
    CRGlobals.notifySheet.appendRow([CRGlobals.studentId, cw.id, 'UNSENT', CRGlobals.now, msg, 'Celebration']);
  }
}
function remove_notifications_(id) {
  
  // BUG: We need to lock the sheet.
  //      Anything added to the sheet after this line and before the new values are added... will get clobbered.

  Logger.log('Removing notifications for id %s', id);
  var data = CRGlobals.notifySheet.getDataRange().getValues();

  for (var i=0; i< data.length; i++) {
    if (data[i][ CRGlobals.NOTIFY_CW_COL-1 ] == id &&
        data[i][ CRGlobals.NOTIFY_TYPE_COL-1 ] == 'Reminder') { 
      
      if (data[i][ CRGlobals.NOTIFY_STATUS_COL-1 ] == 'UNSENT') { 
        data[i][ CRGlobals.NOTIFY_STATUS_COL-1 ] = 'DELETED'; 
        Logger.log('Removing notification %s', data[i]);
      }
    }
  }

    
  var range = CRGlobals.notifySheet.getRange(1,1,data.length, data[0].length);

  CRGlobals.notifySheet.clear();
  range.setValues(data);
  
}


function get_status_(cw,sm) {
  
  // get status (and color code the status cell, just for fun)
  var r = {};
  var state = sm.state;
  var subState = '';
  var statusColor = '#00ff00';  // green
  var statusImage = CRGlobals.darkGreenImg;
  
  var d;
  if (cw.dueDate && !cw.d) {
    cw.d = new Date(Date.UTC(cw.dueDate.year, cw.dueDate.month-1, cw.dueDate.day, cw.dueTime.hours || 0, cw.dueTime.minutes || 0));
  }
  
  if (is_unfinished_(sm)) {
    
    if (!cw.dueDate) { 
      state = 'UNKNOWN DUE DATE'; 
      statusColor = '#cccccc'; 
      statusImage = CRGlobals.grayImg; 
    }
    else if (cw.d < CRGlobals.now) {
      
      state = 'OVERDUE'; 
      
      if      (due_this_week_(cw.d)) { subState = 'This week';        statusColor = '#ffaa00';  statusImage = CRGlobals.orangeImg;  } 
      else if (due_last_week_(cw.d)) { subState = 'Last week';        statusColor = '#ff0000';  statusImage = CRGlobals.redImg;     } 
      else                           { subState = 'Before last week'; statusColor = '#cc0000';  statusImage = CRGlobals.deepRedImg; }
    }
    else {
      
      state = 'CURRENT'; 
      
      if      (due_within_3_hours_(cw.d)) { subState = 'Today';           statusColor = '#ffff00';  statusImage = CRGlobals.yellowImg;    }
      else if (due_today_(cw.d)         ) { subState = 'Today';           statusColor = '#00ff00';  statusImage = CRGlobals.greenImg;     }
      else if (due_this_week_(cw.d)     ) { subState = 'This week';       statusColor = '#00cc00';  statusImage = CRGlobals.deepGreenImg; }
      else                                { subState = 'After this week'; statusColor = '#00cc00';  statusImage = CRGlobals.deepGreenImg; }
    }
  }
  else {
    //Logger.log('%s is finished, id %s', cw.title, cw.id);
    
    if (state == 'TURNED_IN' || state == 'RETURNED') { state = 'COMPLETED'; }
    else                                             { Logger.log('%s:  funny state %s', cw.title, state); }

    var ts = get_completion_timestamp_(sm);
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

/* Functions for calculating when assignments are due
 *
 * due_within_3_hours_(dueDate)
 * due_today_(dueDate)
 * due_this_week_(dueDate)
 * due_last_week_(dueDate)
 *
 */
function due_within_3_hours_(dueDate) {
  if (dueDate >= CRGlobals.now && dueDate < CRGlobals.three_hours_from_now) { return true; }
  return false;
}
function due_today_(dueDate) {
  if (dueDate >= CRGlobals.today && dueDate < CRGlobals.tomorrowCutoff) { return true; }
  return false;
}
function due_this_week_(dueDate) {
  if (dueDate >= CRGlobals.thisMonday && dueDate < CRGlobals.nextMonday) { return true; }
  return false;
}
function due_last_week_(dueDate) {
  if (dueDate >= CRGlobals.lastMonday && dueDate < CRGlobals.thisMonday) { return true; }
  return false;
}


/* Functions for calculating when assignments were completed
 *
 * completed_today_(completionDate)
 * completed_this_week_(completionDate)
 * completed_last_week_(completionDate)
 * completed_before_last_week_(completionDate)
 *
 */
function completed_today_(date) {
  if (date > CRGlobals.today) { return true; }
  return false;
}
function completed_this_week_(date) {
  if (date <= CRGlobals.today && date > CRGlobals.thisMonday) { return true; }
  return false;
}
function completed_last_week_(date) {
  if (date <= CRGlobals.today && date > CRGlobals.lastMonday) { return true; }
  return false;
}
function completed_before_last_week_(date) {
  if (date <= CRGlobals.lastMonday) { return true; }
  return false;
}


/* 
 *  Archive any assignments that have been deleted, or are due after the cutoff date.
 *  Archiving means moving them from the Classwork sheet to the Archived Classwork sheet.
 *  (Will we still send SMS notifications when archived assignments are completed?)
 *  Do we want to run this once daily or whenever we update?
 */
function archive_old_work_(cutoffDate) {
  // BUG: not actually implemented yet.  Not that it's hard...
  Logger.log('Need to implement archiving old assignments!');
}




function add_headers_to_spreadsheet_() {
  CRGlobals.sheet.appendRow(["Due Date", "Status", "Status Detail", "Assignment Name", "Assigned Date", "Course", "Course ID", "Link to Course", "Assignment ID", "Link to Assignment", "Student Work ID", "Link to Student Work", "Status Image", "Late", "Student ID", "Description", "Grade", "Max Points", "Last Update Coursework", "Last Update Submission"]);
  CRGlobals.sheet.setFrozenRows(1);
}
function add_headers_to_notify_spreadsheet_() {
  CRGlobals.notifySheet.appendRow(["Student ID", "Assignment ID", "Status", "Time", "Text", "Type"]);
  CRGlobals.notifySheet.setFrozenRows(1);
}

function add_new_assignment_to_spreadsheet_(cw,sm) {
  
  var courseName   = get_course_name_(cw);
  var courseLink   = get_course_link_(cw);
  var assignedDate = new Date(cw.scheduledTime || cw.creationTime);
  
  CRGlobals.sheet.appendRow([formatDate_(cw.d), sm.state, sm.subState, cw.title, assignedDate, courseName, cw.courseId, courseLink, cw.id, cw.alternateLink, sm.id, sm.alternateLink, sm.statusImage, sm.late, sm.userId, cw.description, sm.assignedGrade, cw.maxPoints, cw.updateTime, sm.updateTime]);

  if (sm.state == 'CURRENT') {
    update_notifications_(cw);
  }
}

function get_course_name_(cw) {
  if (CRGlobals.courses && cw.courseId && CRGlobals.courses[cw.courseId]) {
    return CRGlobals.courses[cw.courseId].name;
  }
  return '';
}
function get_course_link_(cw) {
  if (CRGlobals.courses && cw.courseId && CRGlobals.courses[cw.courseId]) {
    return CRGlobals.courses[cw.courseId].alternateLink;
  }
  return '';
}


/**
 * Finds coursework in up to 20 courses and stores it in CRGlobals
 */
function hash_coursework_() {
  var r = Classroom.Courses.list({pageSize: 20, studentId: 'me', courseStates: ['ACTIVE']});
  CRGlobals.studentSubmissions = {};
  CRGlobals.courseWork = {};
  CRGlobals.courses = {};

  if (r.courses && r.courses.length > 0) {
    for (var i in r.courses) {
      CRGlobals.courses[r.courses[i].id] = r.courses[i];
      
      // grab up to 200 assignments for this course, throw them into the courseWork hash
      var cwr = Classroom.Courses.CourseWork.list(r.courses[i].id, {pageSize: 200});  
      if (cwr.courseWork && cwr.courseWork.length > 0) {

        for (var k in cwr.courseWork) {
          CRGlobals.courseWork[ cwr.courseWork[k].id ] = cwr.courseWork[k];
        }
      }     
      
      // grab up to 200 student submissions for this course, throw them into the studentSubmissions hash
      var ssr = Classroom.Courses.CourseWork.StudentSubmissions.list(r.courses[i].id, '-', {pageSize: 200, userId: 'me'});
      if (ssr.studentSubmissions && ssr.studentSubmissions.length > 0) {

        if (ssr.studentSubmissions[0].userId) { CRGlobals.studentId = ssr.studentSubmissions[0].userId; }

        for (var j in ssr.studentSubmissions) {
          CRGlobals.studentSubmissions[ ssr.studentSubmissions[j].courseWorkId ] = ssr.studentSubmissions[j];
        }
      }
      
    }
  } else {
    Logger.log('No courses found.');
  }
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

function set_reference_dates_(cutoffHours = 8, cutoffMinutes = 30) {

  CRGlobals.now = new Date();
  CRGlobals.three_hours_from_now = new Date();
  CRGlobals.three_hours_from_now.setTime(CRGlobals.three_hours_from_now.getTime() + (3*60*60*1000));
  
  CRGlobals.today = new Date();
  CRGlobals.today.setHours(0, 0, 0, 0);
  
  CRGlobals.todayCutoff = new Date();
  CRGlobals.todayCutoff.setHours(cutoffHours, cutoffMinutes, 0, 0);
  
  CRGlobals.tomorrowCutoff = new Date();
  CRGlobals.tomorrowCutoff.setDate(CRGlobals.todayCutoff.getDate() + 1);
  CRGlobals.tomorrowCutoff.setHours(cutoffHours, cutoffMinutes, 0, 0);

  

  CRGlobals.thisMonday = new Date();
  CRGlobals.thisMonday.setDate( CRGlobals.today.getDate() - ((CRGlobals.today.getDay()+6) % 7) );
  CRGlobals.thisMonday.setHours(0, 0, 0, 0);
  CRGlobals.lastMonday = new Date(CRGlobals.thisMonday);
  CRGlobals.lastMonday.setDate( CRGlobals.thisMonday.getDate() - 7 );
  CRGlobals.nextMonday = new Date(CRGlobals.thisMonday);
  CRGlobals.nextMonday.setDate( CRGlobals.thisMonday.getDate() + 7 );
  
}

function test_mondays_(d) {
  CRGlobals.thisMonday = new Date();
  
  var day = ['Sun', 'Mon', 'Tue', 'Wed', 'The', 'Fri', 'Sat'];
  
  CRGlobals.thisMonday.setDate( d.getDate() - ((d.getDay()+6) % 7) );
  CRGlobals.thisMonday.setHours(0, 0, 0, 0);
  CRGlobals.lastMonday = new Date(CRGlobals.thisMonday);
  CRGlobals.lastMonday.setDate( CRGlobals.thisMonday.getDate() - 7 );
  CRGlobals.nextMonday = new Date(CRGlobals.thisMonday);
  CRGlobals.nextMonday.setDate( CRGlobals.thisMonday.getDate() + 7 );
  Logger.log('NEW: %s the %s: this Monday %s, last %s, next %s', day[d.getDay()], d.getDate(), CRGlobals.thisMonday, CRGlobals.lastMonday, CRGlobals.nextMonday);

}
function test_reference_dates() {
  CRGlobals.today = new Date();
  CRGlobals.today.setHours(0, 0, 0, 0);
  
  test_mondays_(CRGlobals.today);
  CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);
  CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);
    CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);
    CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);
    CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);
    CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);
    CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);
    CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);
    CRGlobals.today.setDate(CRGlobals.today.getDate()+1);
  test_mondays_(CRGlobals.today);

}


function get_completion_timestamp_(sm) {
  
  // BUG: the updateTime includes teacher changes too, so the time will change when the assignment is graded.
  return sm.updateTime;

  // Ideally we'd walk through the submissionHistory and find when it was turned in,
  // but the submissionHistory seems to always be null.
  
}


function send_sms_(to, msg) {


  var url = "https://api.twilio.com/2010-04-01/Accounts/TWILIO_ACCOUNT_SID/Messages.json";

  var payload = {
    'To':   to,
    'Body': msg,
    'From': 'TWILIO_FROM_PHONE_NUMBER'
  };
  var options = {
    'method': 'post',
    'payload': payload
  };
  options.headers = { 
    'Authorization' : "Basic " + Utilities.base64Encode("TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN")
  };

  return UrlFetchApp.fetch(url, options);
}


function hash_students_(sheetName = 'Students') {
  CRGlobals.sheet = CRGlobals.ss.getSheetByName(sheetName);

  CRGlobals.students = {};

  var students = CRGlobals.sheet.getDataRange().getDisplayValues();

  for (var i=1; i<students.length; i++) {
    CRGlobals.students[ students[i][CRGlobals.STUDENTS_ID_COL-1] ] = students[i];
  }
}

function hash_assignments_(sheetName = 'Classwork') {
  CRGlobals.assignments = {};

  var assignments = CRGlobals.sheet.getDataRange().getDisplayValues();

  for (var i=1; i<assignments.length; i++) {
    CRGlobals.assignments[ assignments[i][CRGlobals.ASSIGNMENT_ID_COL-1] ] = assignments[i];
  }
}
function get_coursework_status_(id) {
  return CRGlobals.assignments[ id ] ? CRGlobals.assignments[ id ][ CRGlobals.STATUS_COL-1 ] : 'NOT FOUND';
}

function sendTestNotifications() {
  sendNotificationsFromSheet_('Classwork Test', 'Notifications Test');
}
function sendNotifications() {
  sendNotificationsFromSheet_('Classwork', 'Notifications');
}
function sendNotificationsFromSheet_(sheetName = 'Classwork', notifySheetName = 'Notifications') {
  // BUG: spreadsheet is hardcoded and shared by all users
  CRGlobals.ss             = SpreadsheetApp.openById(CRGlobals.spreadsheetId);
  CRGlobals.sheet          = CRGlobals.ss.getSheetByName(sheetName);  
  CRGlobals.notifySheet    = CRGlobals.ss.getSheetByName(notifySheetName);
  CRGlobals.now            = new Date();

  
  // Send SMS where
  // * they're UNSENT
  // * the time has passed
  // * the assignment is still not done (if the assignment is not CURRENT, mark its unsent SMS as IGNORED)
  
  hash_assignments_(sheetName);
  hash_students_();

  // TODO: Include % done today in the text message.
  
  // BUG: We only try once.

  
  var data = CRGlobals.notifySheet.getDataRange().getDisplayValues();
  
  
  for (var i=1; i< data.length; i++) {
    var id = data[i][ CRGlobals.NOTIFY_CW_COL-1 ];
    
    var submissionStatus = get_coursework_status_(id);


    if (submissionStatus == 'NOT FOUND') {
      // skip it; there may be a temporary problem hashing the assignments in which case 
      //          we don't want to overwrite all the notification statuses 
      //          (i feel like the plural of status should be stati, is it just me?)
    }
    else if ((submissionStatus != 'CURRENT') && 
             (data[i][ CRGlobals.NOTIFY_STATUS_COL-1 ] == 'UNSENT') &&
             (data[i][ CRGlobals.NOTIFY_TYPE_COL-1   ] == 'Reminder')) 
    {
      CRGlobals.notifySheet.getRange(i + 1, CRGlobals.NOTIFY_STATUS_COL).setValue('IGNORED');
    }
    else if ((data[i][ CRGlobals.NOTIFY_STATUS_COL-1 ] == 'UNSENT') && 
             (new Date(data[i][ CRGlobals.NOTIFY_TIME_COL-1 ]) < CRGlobals.now)) 
    { 
      
      try {
        var msg = data[i][ CRGlobals.NOTIFY_MSG_COL-1 ];
        var studentId = data[i][ CRGlobals.NOTIFY_STUDENT_COL-1 ];
        var pct_complete = CRGlobals.students[ studentId ][ CRGlobals.STUDENTS_PCT_COMPLETE_D_COL-1 ];
        if (pct_complete.match(/^#/)) { 
          pct_complete = CRGlobals.students[ studentId ][ CRGlobals.STUDENTS_N_COMPLETE_D_COL-1 ] || 0;
        } 
        pct_complete = "\n" + pct_complete + " done today\n" + CRGlobals.appUrl;
        
        var to = CRGlobals.students[ studentId ][ CRGlobals.STUDENTS_PHONE_COL-1 ];
        
        // hacky hacky: if it ends in a space then add the % complete today
        const ends_in_space = / $/;
        if (msg.match(ends_in_space)) {  
          msg = msg + pct_complete;
        }
        response_data = send_sms_( to, msg );
        Logger.log('    sent ' + msg + ' to ' + to);
        CRGlobals.notifySheet.getRange(i + 1, CRGlobals.NOTIFY_STATUS_COL).setValue('SENT');
      } catch(err) {
        Logger.log('    %s', err);
        CRGlobals.notifySheet.getRange(i + 1, CRGlobals.NOTIFY_STATUS_COL).setValue('ERROR');
      }
      
    }
  }
}


// TODO: Ideally we'd do these asynchronously and do multiple requests in parallel...
//       ...but for now let's go quick n dirty (er, slow n dirty?)
function get_tinyurl_(url)
{
  
  if (url) {
    
    var payload = {
      'url':   url
    };
  
    var options = {
      'method': 'get',
      'payload': payload
    };
  
    return UrlFetchApp.fetch("https://tinyurl.com/api-create.php", options).getContentText();
  }

  return '';
}

// Enh, let's just check both the assignments hash and courseWork hash, and get data from whichever one exists
function get_assignment_tinyurl_(assignmentId) {
  if (CRGlobals.assignments && assignmentId && CRGlobals.assignments[assignmentId]) {
    return get_tinyurl_( CRGlobals.assignments[assignmentId][ CRGlobals.ASSIGNMENT_LINK_COL ] );
  }
  else if (CRGlobals.courseWork && assignmentId && CRGlobals.courseWork[assignmentId]) {
    return get_tinyurl_( CRGlobals.courseWork[assignmentId].alternateLink );
  }
  return '';
}


/*
 * Functions for automatically updating the Google Spreadsheet with the classwork from Google Classroom
 */
function create_triggers_() {
  
  if (!triggers_exist_()) {
  ScriptApp.newTrigger('updateCourseworkSpreadsheet')
      .timeBased()
      .everyMinutes(30)
      .create();
  }
}
function triggers_exist_() {

  var triggers = ScriptApp.getProjectTriggers();
  for (var  i in triggers) {
    if (triggers[i].getHandlerFunction() == 'updateCourseworkSpreadsheet') {
      return true;
    }
  }
  return false;
}
function delete_triggers_() {

  var triggers = ScriptApp.getProjectTriggers();
  for (var  i in triggers) {
    if (triggers[i].getHandlerFunction() == 'updateCourseworkSpreadsheet') {
      Logger.log('deleting %s', triggers[i]);
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function loadAllClassmates() {
  var r = Classroom.Courses.list({pageSize: 20, studentId: 'me', courseStates: ['ACTIVE']});
  var classmates = [];
  
  if (r.courses && r.courses.length > 0) {
    for (var i=0; i<r.courses.length; i++) {
      Logger.log('%s', r.courses[i]);
      try {
        var cmr = Classroom.Courses.Students.list({courseId: r.courses[i].id});
        Logger.log('Would add %s', cmr);

      } 
      catch (err) {
        Logger.log('    %s', err);
      }
    }
  }
}
