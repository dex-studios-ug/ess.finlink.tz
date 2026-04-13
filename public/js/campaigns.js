

(function(module){
const campaigntemplate={
        "smsProviderOptions": [{
        "id": 1,
        "tenantId": "1",
        "phoneNo": "+256763458083",
        "providerName": "Dex Studios Ltd SMS Provider",
        "providerDescription": "Professional Grade Bulk Sms Solutions for Commerce"
        }],
        "businessRulesOptions": [
            {
            "reportId": 166,
            "reportName": "Active Clients",
            "reportType": "SMS",
            "reportSubType": "NonTriggered",
            "reportDescription": "All clients with the status ‘Active’",
            "reportParamName": {
                "Office": "OfficeIdSelectOne",
                "Loan Officer": "loanOfficerIdSelectAll"
            }
            }
        ],
        "triggerTypeOptions": [
            {"id": 1,"code": "triggerType.direct", "value": "Direct"},
           // {"id": 2, "code": "triggerType.schedule","value": "Scheduled"},
          //  {"id": 3,"code": "triggerType.triggered","value": "Triggered"}
            ],
        "months": [
        { "id": 1, "code": "JANUARY", "value": "JANUARY" },
        { "id": 2, "code": "FEBRUARY", "value": "FEBRUARY" },
        { "id": 3, "code": "MARCH", "value": "MARCH" },
        { "id": 4, "code": "APRIL", "value": "APRIL" },
        { "id": 5, "code": "MAY", "value": "MAY" },
        { "id": 6, "code": "JUNE", "value": "JUNE" },
        { "id": 7, "code": "JULY", "value": "JULY" },
        { "id": 8, "code": "AUGUST", "value": "AUGUST" },
        { "id": 9, "code": "SEPTEMBER", "value": "SEPTEMBER"},
        { "id": 10, "code": "OCTOBER", "value": "OCTOBER"},
        { "id": 11, "code": "NOVEMBER", "value": "NOVEMBER" }
    ],
    "weekDays": [
        { "id": 1, "code": "calendarWeekDaysType.monday", "value": "MO" },
        { "id": 2, "code": "calendarWeekDaysType.tuesday", "value": "TU" },
        { "id": 3, "code": "calendarWeekDaysType.wednesday", "value": "WE" },
        { "id": 4, "code": "calendarWeekDaysType.thursday", "value": "TH"},
        { "id": 5, "code": "calendarWeekDaysType.friday", "value": "FR" },
        { "id": 6, "code": "calendarWeekDaysType.saturday", "value": "SA" },
        { "id": 7, "code": "calendarWeekDaysType.sunday", "value": "SU" }
    ],
    "frequencyTypeOptions": [
        { "id": 1, "code": "calendarFrequencyType.daily", "value": "DAILY" },
        { "id": 2, "code": "calendarFrequencyType.weekly", "value": "WEEKLY"},
        { "id": 3, "code": "calendarFrequencyType.monthly", "value": "MONTHLY"},
        { "id": 4, "code": "calendarFrequencyType.yearly", "value": "YEARLY" }
    ],
    "periodFrequencyOptions": [
        { "id": 0, "code": "periodFrequencyType.days", "value": "DAYS" },
        { "id": 1, "code": "periodFrequencyType.weeks", "value": "WEEKS" },
        { "id": 2, "code": "periodFrequencyType.months", "value": "MONTHS" },
        { "id": 3, "code": "periodFrequencyType.years", "value": "YEARS" }
    ]
};

 mifosX.controllers = _.extend(module, {
        CreateSmsCampaignController: function  CreateSmsCampaignController(scope, WizardHandler, resourceFactory, location, http, dateFilter, API_VERSION, Upload, $rootScope, routeParams) {
       
             scope.reportParams = new Array();
            scope.reportDateParams = new Array();
            scope.reqFields = new Array();
            scope.reportTextParams = new Array();
            scope.reportData = {};
            scope.reportData.columnHeaders = [];
            scope.reportData.data = [];
            scope.submissionData = {};
            scope.minDate = new Date();
            scope.restrictDate = new Date();
            scope.offices = [];
            scope.staffs = [];
            scope.selectedObjects = {};
            scope.formData = {};
            scope.formData.client = {};
            scope.today = new Date();
            scope.isButtonDisabled = false;
            scope.triggerTypeOptions = [] ;
            scope.campaignTypeOptions = [];
            scope.providerOptions = [] ;
            scope.businessRules = [] ;
            scope.campaignData = {};
            scope.campaignData.campaignMessage = "";
            scope.previewData = {};
            scope.filteredBusinessRules = [];
            var triggeredBusinessRule = [];
            var nonTriggeredBusinessRule = [];
            scope.simpleDate = new Date();
            var simpleTime = new Date(scope.simpleDate.getTime());
            scope.campaignData.time = new Date(0, 0, 0, simpleTime.getHours(), simpleTime.getMinutes(), simpleTime.getSeconds());

            scope.buildMessageTemplate = function (paramName) {
                scope.campaignData.campaignMessage += " " + "{{" + paramName + "}}";
            }

            scope.reportSelected = function (reportName) {
                scope.reqFields = [] ;
                scope.reportParams = [] ;
                scope.reportDateParams = [] ;
                scope.reportTextParams  = [] ;

                resourceFactory.runReportsResource.getReport({reportSource: 'FullParameterList', parameterType: true, R_reportListing: "'" + reportName + "'"}, function (data) {
                    for (var i in data.data) {
                        var temp = {
                            name: data.data[i].row[0],
                            variable: data.data[i].row[1],
                            label: data.data[i].row[2],
                            displayType: data.data[i].row[3],
                            formatType: data.data[i].row[4],
                            defaultVal: data.data[i].row[5],
                            selectOne: data.data[i].row[6],
                            selectAll: data.data[i].row[7],
                            parentParameterName: data.data[i].row[8],
                            inputName: "R_" + data.data[i].row[1] //model name
                        };
                        scope.reqFields.push(temp);
                        if (temp.displayType == 'select' && temp.parentParameterName == null) {
                            intializeParams(temp, {});
                        } else if (temp.displayType == 'date') {
                            scope.reportDateParams.push(temp);
                        } else if (temp.displayType == 'text') {
                            scope.reportTextParams.push(temp);
                        }
                    }
                });

            } ;
            scope.getBusinessRule = function() {
                if (!_.isUndefined(scope.campaignData.triggerType.value) && scope.campaignData.triggerType.value === 'Triggered') {
                    scope.filteredBusinessRules = triggeredBusinessRule;
                } else {
                    scope.filteredBusinessRules =  nonTriggeredBusinessRule;
                }
            };

            scope.filterBusinessRule = function() {
                triggeredBusinessRule = [];
                nonTriggeredBusinessRule = [];
                angular.forEach(scope.businessRuleOptions, function (businessRule) {
                    if (!_.isNull(businessRule.reportSubType) && !_.isUndefined(businessRule.reportSubType) && businessRule.reportSubType === 'Triggered') {
                        triggeredBusinessRule.push(businessRule);
                    } else {
                        nonTriggeredBusinessRule.push(businessRule);
                    }
                });
            };

            function intializeParams(paramData, params) {
                scope.errorStatus = undefined;
                scope.errorDetails = [];
                params.reportSource = paramData.name;
                params.parameterType = true;
                var successFunction = getSuccuessFunction(paramData);
                resourceFactory.runReportsResource.getReport(params, successFunction);
            }

            function getSuccuessFunction(paramData) {
                var tempDataObj = new Object();
                var successFunction = function (data) {
                    var selectData = [];
                    var isExistedRecord = false;
                    for (var i in data.data) {
                        selectData.push({id: data.data[i].row[0], name: data.data[i].row[1]});
                    }
                    for (var j in scope.reportParams) {
                        if (scope.reportParams[j].name == paramData.name) {
                            scope.reportParams[j].selectOptions = selectData;
                            isExistedRecord = true;
                        }
                    }
                    if (!isExistedRecord) {
                        if(paramData.selectAll == 'Y'){
                            selectData.push({id: "-1", name: "All"});
                        }
                        paramData.selectOptions = selectData;
                        scope.reportParams.push(paramData);
                    }
                };
                return successFunction;
            }

            scope.getDependencies = function (paramData) {
                for (var i = 0; i < scope.reqFields.length; i++) {
                    var temp = scope.reqFields[i];
                    if (temp.parentParameterName == paramData.name) {
                        if (temp.displayType == 'select') {
                            var parentParamValue = this.formData[paramData.inputName];
                            if (parentParamValue != undefined) {
                                eval("var params={};params." + paramData.inputName + "='" + parentParamValue + "';");
                                intializeParams(temp, params);
                            }
                        } else if (temp.displayType == 'date') {
                            scope.reportDateParams.push(temp);
                        }
                    }
                }
                resourceFactory.reportsResource.get({id: scope.campaignData.report.reportId, fields: 'reportParameters'}, function (data) {
                    scope.smsReportParameters = data.reportParameters || [];
                });
            };

            scope.getColumnHeaders = function () {
                parameterValidationErrors();
                if (scope.errorDetails.length === 0) {
                    scope.formData.reportSource = scope.campaignData.report.reportName;

                    for (var i = 0; i < scope.reqFields.length; i++) {
                        var tempForm = {};
                        var tempParam = scope.reqFields[i];
                        if (tempParam.displayType == 'none') {
                            var paramName = tempParam.variable;
                            scope.formData[tempParam.inputName] = -1;
                        }
                    }
                    resourceFactory.runReportsResource.getReport(scope.formData, function (data) {
                        scope.reportData.columnHeaders = data.columnHeaders;
                    });
                }
            };

            function buildPreviewParms() {
                var paramCount = 1;
                var reportParams = "{";
                for (var i = 0; i < scope.reqFields.length; i++) {
                    var reqField = scope.reqFields[i];
                    for (var j = 0; j < scope.smsReportParameters.length; j++) {
                        var tempParam = scope.smsReportParameters[j];
                        if (reqField.name == tempParam.parameterName) {
                            var paramName = reqField.variable;
                            if (paramCount > 1) reportParams += ","
                            reportParams += '\"' + paramName  + '\"' + ":" + scope.formData[scope.reqFields[i].inputName];
                            paramCount = paramCount + 1;
                        }
                    }
                }
                reportParams += "}"
                return reportParams;
            };

            scope.previewMessage = function() {
                scope.paramValues = {};
                scope.paramValues = angular.fromJson(buildPreviewParms());
                scope.paramValues.reportName = scope.formData.reportSource;
                scope.previewData = {
                    message: scope.campaignData.campaignMessage,
                    paramValue: scope.paramValues
                };
                    resourceFactory.smsCampaignResource.preview({additionalParam: 'preview'}, scope.previewData, function (data) {
                        scope.previewMessage = data.campaignMessage;
                        scope.totalNumberOfMessages = data.totalNumberOfMessages;
                    });
            }

            function buildReportParms() {
                var paramCount = 1;
                var reportParams = "";
                for (var i = 0; i < scope.reqFields.length; i++) {
                    var reqField = scope.reqFields[i];
                    for (var j = 0; j < scope.smsReportParameters.length; j++) {
                        var tempParam = scope.smsReportParameters[j];
                        if (reqField.name == tempParam.parameterName) {
                            if(reqField.displayType == 'none') {
                                var paramName = 'R_' + tempParam.reportParameterName;
                                if (paramCount > 1) reportParams += ","
                                reportParams += encodeURIComponent(paramName) + ":" + encodeURIComponent("-1");
                                paramCount = paramCount + 1;
                            }else {
                                var paramName = 'R_' + tempParam.reportParameterName;
                                if (paramCount > 1) reportParams += ","
                                reportParams += encodeURIComponent(paramName) + ":" + encodeURIComponent(scope.formData[scope.reqFields[i].inputName]);
                                paramCount = paramCount + 1;
                            }
                        }
                    }
                }
                /*for (var i = 0; i < scope.reqFields.length; i++) {
                    var tempParam = scope.reqFields[i];
                    if (tempParam.displayType == 'none') {
                        reportParams += ","
                        reportParams += encodeURIComponent(tempParam.inputName) + ":" + encodeURIComponent("-1");
                    }
                }*/
                return reportParams;
            };

            function parameterValidationErrors() {
                var tmpStartDate = "";
                var tmpEndDate = "";
                scope.errorDetails = [];
                for (var i in scope.reqFields) {
                    var paramDetails = scope.reqFields[i];
                    switch (paramDetails.displayType) {
                        case "select":
                            var selectedVal = scope.formData[paramDetails.inputName];
                            if (selectedVal == undefined || selectedVal == 0) {
                                var fieldId = '#' + paramDetails.inputName;
                                $(fieldId).addClass("validationerror");
                                var errorObj = new Object();
                                errorObj.field = paramDetails.inputName;
                                errorObj.code = 'error.message.report.parameter.required';
                                errorObj.args = {params: []};
                                errorObj.args.params.push({value: paramDetails.label});
                                scope.errorDetails.push(errorObj);
                            }
                            break;
                        case "date":
                            var tmpDate = scope.formData[paramDetails.inputName];
                            if (tmpDate == undefined || !(tmpDate > "")) {
                                var fieldId = '#' + paramDetails.inputName;
                                $(fieldId).addClass("validationerror");
                                var errorObj = new Object();
                                errorObj.field = paramDetails.inputName;
                                errorObj.code = 'error.message.report.parameter.required';
                                errorObj.args = {params: []};
                                errorObj.args.params.push({value: paramDetails.label});
                                scope.errorDetails.push(errorObj);
                            }
                            if (tmpDate && invalidDate(tmpDate) == true) {
                                var fieldId = '#' + paramDetails.inputName;
                                $(fieldId).addClass("validationerror");
                                var errorObj = new Object();
                                errorObj.field = paramDetails.inputName;
                                errorObj.code = 'error.message.report.invalid.value.for.parameter';
                                errorObj.args = {params: []};
                                errorObj.args.params.push({value: paramDetails.label});
                                scope.errorDetails.push(errorObj);
                            }

                            if (paramDetails.variable == "startDate") tmpStartDate = tmpDate;
                            if (paramDetails.variable == "endDate") tmpEndDate = tmpDate;
                            break;
                        case "text":
                            var selectedVal = scope.formData[paramDetails.inputName];
                            if (selectedVal == undefined) {
                                var fieldId = '#' + paramDetails.inputName;
                                $(fieldId).addClass("validationerror");
                                var errorObj = new Object();
                                errorObj.field = paramDetails.inputName;
                                errorObj.code = 'error.message.report.parameter.required';
                                errorObj.args = {params: []};
                                errorObj.args.params.push({value: paramDetails.label});
                                scope.errorDetails.push(errorObj);
                            }
                            break;
                    }
                }

                if (tmpStartDate > "" && tmpEndDate > "") {
                    if (tmpStartDate > tmpEndDate) {
                        var errorObj = new Object();
                        errorObj.field = paramDetails.inputName;
                        errorObj.code = 'error.message.report.incorrect.values.for.date.fields';
                        errorObj.args = {params: []};
                        errorObj.args.params.push({value: paramDetails.label});
                        scope.errorDetails.push(errorObj);
                    }
                }
            }

            /*resourceFactory.smsCampaignTemplateResource.get(function (data) {
                scope.triggerTypeOptions = data.triggerTypeOptions ;
                scope.campaignTypeOptions = data.campaignTypeOptions;
                scope.providerOptions = data.smsProviderOptions ;
                scope.businessRuleOptions = data.businessRulesOptions ;
                scope.frequencyTypeOptions = data.frequencyTypeOptions;
                scope.weekDays = data.weekDays;
                scope.filterBusinessRule();
            });*/

             resourceFactory.runReportsResource.get({reportSource: 'FullReportList', parameterType: true, genericResultSet: false,reportType:"SMS"}
            ,function(data){
                dat=[],seen=[]
                data.forEach(dd=>{
            if(dd.report_type=="SMS"&&!seen.includes(dd.report_name)){     
            seen.push(dd.report_name);
               const params={
            "reportId": dd.report_id,
            "reportName": dd.report_name,
            "reportType": "SMS",
            "reportSubType": dd.report_subtype,
            "reportDescription": dd.report_name,
            "reportParamName":{ }}
            params[dd.parameter_name]= dd.parameter_name
            params[dd.report_parameter_name]= dd.report_parameter_name
            dat.push(params)
            console.log(dd)
        }
        
                })
                console.log(dat)
                const tmpdata=campaigntemplate;
            scope.triggerTypeOptions = tmpdata.triggerTypeOptions ;
                scope.campaignTypeOptions = tmpdata.campaignTypeOptions;
                scope.providerOptions = tmpdata.smsProviderOptions ;
               scope.businessRuleOptions = dat
        ;//alert(JSON.stringify(scope.businessRuleOptions))
                scope.frequencyTypeOptions = tmpdata.frequencyTypeOptions;
                scope.weekDays = tmpdata.weekDays;
                scope.filterBusinessRule();
            })
            

            scope.changeStaff = function (staffId) {
                resourceFactory.employeeResource.get({staffInSelectedOfficeOnly:true, associations:'all', staffId: staffId}, function (data) {
                    scope.linkedvillages = data.linkedVillages;
                });
            };

            scope.selectedPeriod = function (period) {
                if (period == 1) {
                    scope.repeatsEveryOptions = ["1", "2", "3"];
                    scope.periodValue = "day(s)"
                }
                if (period == 2) {
                    scope.repeatsEveryOptions = ["1", "2", "3"];
                    scope.periodValue = "week(s)";
                    scope.campaignData.repeatsOnDay = '1';
                    scope.repeatsOnOptions = scope.weekDays;
                }
                if (period == 3) {
                    scope.periodValue = "month(s)";
                    scope.repeatsEveryOptions = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
                }
                if (period == 4) {
                    scope.periodValue = "year(s)";
                    scope.repeatsEveryOptions = ["1", "2", "3", "4", "5"];
                }
            };

            scope.noOfTabs = 3;
            scope.step = '-';

            scope.submit = function () {
                //onclick Disable proceed button to avoid multiple cilent creation
                setDisableTimeout();

                if (WizardHandler.wizard().getCurrentStep() != scope.noOfTabs) {
                    WizardHandler.wizard().next();
                    /*if (WizardHandler.wizard().getCurrentStep() == 2) {
                     if (scope.validateFiles())
                     WizardHandler.wizard().next();
                     } else {
                     WizardHandler.wizard().next();
                     }*/
                    return;
                }

                if (scope.campaignData.triggerType.value === 'Scheduled') {
                    scope.scheduledDateTime = scope.campaignData.recurrenceStartDate;
                    scope.scheduledDateTime.setHours(scope.campaignData.time.getHours());
                    scope.scheduledDateTime.setMinutes(scope.campaignData.time.getMinutes());
                    scope.scheduledDateTime.setSeconds(scope.campaignData.time.getSeconds());
                    scope.scheduledDateTime = dateFilter(scope.scheduledDateTime, scope.dft);
                }
                    //dateFilter(scope.campaignData.recurrenceStartDate, scope.df) + ' ' + scope.campaignData.time.getHours() + ':' + scope.campaignData.time.getMinutes() + ':' + scope.campaignData.time.getSeconds();
                scope.submissionData = {
                    providerId: scope.campaignData.smsProvider.id,
                    //runReportId: scope.campaignData.report.reportId,
                    triggerType: scope.campaignData.triggerType.id,
                    campaignName: scope.campaignData.campaignName,
                    campaignType: 1,
                    message: scope.campaignData.campaignMessage,
                    //paramValue: scope.paramValues,
                    dateFormat: scope.df,
                    locale: scope.optlang.code,
                    submittedOnDate: dateFilter(new Date(), scope.df),
                    recurrenceStartDate: scope.scheduledDateTime,
                    dateTimeFormat: scope.dft,
                    frequency: scope.campaignData.frequency,
                    interval: scope.campaignData.repeatsEvery,
                    repeatsOnDay: scope.campaignData.repeatsOnDay
                }

                scope.submissionData.runReportId = scope.campaignData.report.reportId;
                scope.submissionData.paramValue = scope.paramValues;

                resourceFactory.smsCampaignResource.save(scope.submissionData, function(data) {
                    location.path('/viewsmscampaign/' + data.resourceId);
                });

            };

            var setDisableTimeout = function(){
                scope.isButtonDisabled = true;
                setTimeout(function(){
                    scope.isButtonDisabled = false;
                }, 5000);
            }
        }
    });
     mifosX.ng.application.config(['$controllerProvider',function($controllerProvider){
    $controllerProvider.register("CreateSmsCampaignController", ['$scope', 'WizardHandler', 'ResourceFactory', '$location', '$http',
         'dateFilter', 'API_VERSION', 'Upload', '$rootScope', '$routeParams', mifosX.controllers.CreateSmsCampaignController])
        
       
}]);

        }(mifosX.controllers || {}));
    

   

   