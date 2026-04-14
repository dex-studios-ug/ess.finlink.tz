(function (module) {
    mifosX.controllers = _.extend(module, {
        LoanAccountActionsControllerx: function (scope, resourceFactory, location, routeParams, dateFilter,http) {

            scope.action = routeParams.action || "";
            scope.accountId = routeParams.id;
            scope.formData = {};
            scope.showDateField = true;
            scope.showNoteField = true;
            scope.showAmountField = false;
            scope.restrictDate = new Date();
            // Transaction UI Related
            scope.isTransaction = false;
            scope.showPaymentDetails = false;
            scope.paymentTypes = [];
            scope.expectedDisbursementDate = [];
            scope.disbursementDetails = [];
            scope.showTrancheAmountTotal = 0;
            scope.processDate = false;

            switch (scope.action) {
                case "approve":
                    scope.taskPermissionName = 'APPROVE_LOAN';
                    resourceFactory.loanTemplateResource.get({loanId: scope.accountId, templateType: 'approval'}, function (data) {

                        scope.title = 'label.heading.approveloanaccount';
                        scope.labelName = 'label.input.approvedondate';
                        scope.modelName = 'approvedOnDate';
                        scope.formData[scope.modelName] =  new Date();
                        scope.showApprovalAmount = true;
                        scope.formData.approvedLoanAmount =  data.approvalAmount;
                    });
                    resourceFactory.LoanAccountResource.getLoanAccountDetails({loanId: routeParams.id, associations: 'multiDisburseDetails'}, function (data) {
                        scope.expectedDisbursementDate = new Date(data.timeline.expectedDisbursementDate);
                        if(data.disbursementDetails != ""){
                            scope.disbursementDetails = data.disbursementDetails;
                            scope.approveTranches = true;
                        }
                        for(var i in data.disbursementDetails){
                            scope.disbursementDetails[i].expectedDisbursementDate = new Date(data.disbursementDetails[i].expectedDisbursementDate);
                            scope.disbursementDetails[i].principal = data.disbursementDetails[i].principal;
                            scope.showTrancheAmountTotal += Number(data.disbursementDetails[i].principal) ;
                        }
                    });
                    break;
                case "reject":
                    scope.title = 'label.heading.rejectloanaccount';
                    scope.labelName = 'label.input.rejectedondate';
                    scope.modelName = 'rejectedOnDate';
                    scope.formData[scope.modelName] = new Date();
                    scope.taskPermissionName = 'REJECT_LOAN';
                    break;
                case "withdrawnByApplicant":
                    scope.title = 'label.heading.withdrawloanaccount';
                    scope.labelName = 'label.input.withdrawnondate';
                    scope.modelName = 'withdrawnOnDate';
                    scope.formData[scope.modelName] = new Date();
                    scope.taskPermissionName = 'WITHDRAW_LOAN';
                    break;
                case "undoapproval":
                    scope.title = 'label.heading.undoapproveloanaccount';
                    scope.showDateField = false;
                    scope.taskPermissionName = 'APPROVALUNDO_LOAN';
                    break;
                case "undodisbursal":
                    scope.title = 'label.heading.undodisburseloanaccount';
                    scope.showDateField = false;
                    scope.taskPermissionName = 'DISBURSALUNDO_LOAN';
                    break;
                case "disburse":
                    scope.modelName = 'actualDisbursementDate';
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'disburse'}, function (data) {
                        scope.paymentTypes = data.paymentTypeOptions;
                        if (data.paymentTypeOptions.length > 0) {
                            scope.formData.paymentTypeId = data.paymentTypeOptions[0].id;
                        }
                        scope.formData.transactionAmount = data.amount;
                        scope.formData[scope.modelName] = new Date();
                        if (data.fixedEmiAmount) {
                            scope.formData.fixedEmiAmount = data.fixedEmiAmount;
                            scope.showEMIAmountField = true;
                        }
                    });
                    scope.title = 'label.heading.disburseloanaccount';
                    scope.labelName = 'label.input.disbursedondate';
                    scope.isTransaction = true;
                    scope.showAmountField = true;
                    scope.taskPermissionName = 'DISBURSE_LOAN';
                    break;
                case "disbursetosavings":
                    scope.modelName = 'actualDisbursementDate';
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'disburseToSavings'}, function (data) {
                       scope.formData.transactionAmount = data.amount;
                        scope.formData[scope.modelName] = new Date();
                        if (data.fixedEmiAmount) {
                            scope.formData.fixedEmiAmount = data.fixedEmiAmount;
                            scope.showEMIAmountField = true;
                        }
                    });
                    scope.title = 'label.heading.disburseloanaccount';
                    scope.labelName = 'label.input.disbursedondate';
                    scope.isTransaction = false;
                    scope.showAmountField = true;
                    scope.taskPermissionName = 'DISBURSETOSAVINGS_LOAN';
                    break;
                case "repayment":
                    scope.modelName = 'transactionDate';
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'repayment'}, function (data) {
                        scope.paymentTypes = data.paymentTypeOptions;
                        if (data.paymentTypeOptions.length > 0) {
                            scope.formData.paymentTypeId = data.paymentTypeOptions[0].id;
                        }
                        scope.formData.transactionAmount = data.amount;
                        scope.formData[scope.modelName] = new Date(data.date) || new Date();
                        if(data.penaltyChargesPortion>0){
                            scope.showPenaltyPortionDisplay = true;
                        }
                    });
                    scope.title = 'label.heading.loanrepayments';
                    scope.labelName = 'label.input.transactiondate';
                    scope.isTransaction = true;
                    scope.showAmountField = true;
                    scope.showvoucherNumberField =true;
                    scope.showpaymentDescriptionField =true;
                    scope.taskPermissionName = 'REPAYMENT_LOAN';
                    break;
                case "prepayloan":
                    scope.modelName = 'transactionDate';
                    scope.formData.transactionDate =  new Date();
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'prepayLoan'}, function (data) {
                        scope.paymentTypes = data.paymentTypeOptions;
                        if (data.paymentTypeOptions.length > 0) {
                            scope.formData.paymentTypeId = data.paymentTypeOptions[0].id;
                        }
                        scope.formData.transactionAmount = data.amount;
                        if(data.penaltyChargesPortion>0){
                            scope.showPenaltyPortionDisplay = true;
                        }
                        scope.principalPortion = data.principalPortion;
                        scope.interestPortion = data.interestPortion;
                        scope.processDate = true;
                    });
                    scope.title = 'label.heading.prepayloan';
                    scope.labelName = 'label.input.transactiondate';
                    scope.isTransaction = true;
                    scope.showAmountField = true;
                    scope.showvoucherNumberField =true;
                    scope.showpaymentDescriptionField =true;
                    scope.taskPermissionName = 'REPAYMENT_LOAN';
                    scope.action = 'repayment';
                    break;
                case "waiveinterest":
                    scope.modelName = 'transactionDate';
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'waiveinterest'}, function (data) {
                        scope.paymentTypes = data.paymentTypeOptions;
                        scope.formData.transactionAmount = data.amount;
                        scope.formData[scope.modelName] = new Date(data.date) || new Date();
                    });
                    scope.title = 'label.heading.loanwaiveinterest';
                    scope.labelName = 'label.input.interestwaivedon';
                    scope.showAmountField = true;
                    scope.taskPermissionName = 'WAIVEINTERESTPORTION_LOAN';
                    break;
                case "writeoff":
                    scope.modelName = 'transactionDate';
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'writeoff'}, function (data) {
                        scope.formData[scope.modelName] = new Date(data.date) || new Date();
                        scope.writeOffAmount = data.amount;
                        scope.isLoanWriteOff = true;
                    });
                    scope.title = 'label.heading.writeoffloanaccount';
                    scope.labelName = 'label.input.writeoffondate';
                    scope.taskPermissionName = 'WRITEOFF_LOAN';
                    break;
                case "close-rescheduled":
                    scope.modelName = 'transactionDate';
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'close-rescheduled'}, function (data) {
                        scope.formData[scope.modelName] = new Date(data.date) || new Date();
                    });
                    scope.title = 'label.heading.closeloanaccountasrescheduled';
                    scope.labelName = 'label.input.closedondate';
                    scope.taskPermissionName = 'CLOSEASRESCHEDULED_LOAN';
                    break;
                case "close":
                    scope.modelName = 'transactionDate';
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'close'}, function (data) {
                        scope.formData[scope.modelName] = new Date(data.date) || new Date();
                    });
                    scope.title = 'label.heading.closeloanaccount';
                    scope.labelName = 'label.input.closedondate';
                    scope.taskPermissionName = 'CLOSE_LOAN';
                    break;
                case "unassignloanofficer":
                    scope.title = 'label.heading.unassignloanofficer';
                    scope.labelName = 'label.input.loanofficerunassigneddate';
                    scope.modelName = 'unassignedDate';
                    scope.showNoteField = false;
                    scope.formData[scope.modelName] = new Date();
                    scope.taskPermissionName = 'REMOVELOANOFFICER_LOAN';
                    break;
                case "modifytransaction":
                    resourceFactory.loanTrxnsResource.get({loanId: scope.accountId, transactionId: routeParams.transactionId, template: 'true'},
                        function (data) {
                            scope.title = 'label.heading.editloanaccounttransaction';
                            scope.labelName = 'label.input.transactiondate';
                            scope.modelName = 'transactionDate';
                            scope.paymentTypes = data.paymentTypeOptions || [];
                            scope.formData.transactionAmount = data.amount;
                            scope.formData[scope.modelName] = new Date(data.date) || new Date();
                            if (data.paymentDetailData) {
                                if (data.paymentDetailData.paymentType) {
                                    scope.formData.paymentTypeId = data.paymentDetailData.paymentType.id;
                                }
                                scope.formData.accountNumber = data.paymentDetailData.accountNumber;
                                scope.formData.checkNumber = data.paymentDetailData.checkNumber;
                                scope.formData.routingCode = data.paymentDetailData.routingCode;
                                scope.formData.receiptNumber = data.paymentDetailData.receiptNumber;
                                scope.formData.bankNumber = data.paymentDetailData.bankNumber;
                                scope.formData.voucherNumber = data.paymentDetailData.voucherNumber;
                                scope.formData.paymentDescription = data.paymentDetailData.paymentDescription;
                            }
                        });
                    scope.showDateField = true;
                    scope.showNoteField = false;
                    scope.showAmountField = true;
                    scope.showvoucherNumberField =true;
                    scope.showpaymentDescriptionField =true;
                    scope.isTransaction = true;
                    scope.showPaymentDetails = false;
                    scope.taskPermissionName = 'ADJUST_LOAN';
                    break;
                case "deleteloancharge":
                    scope.showDelete = true;
                    scope.showNoteField = false;
                    scope.showDateField = false;
                    scope.taskPermissionName = 'DELETE_LOANCHARGE';
                    break;
                case "recoverguarantee":
                    scope.showDelete = true;
                    scope.showNoteField = false;
                    scope.showDateField = false;
                    scope.taskPermissionName = 'RECOVERGUARANTEES_LOAN';
                    break;
                case "waivecharge":
                    resourceFactory.LoanAccountResource.get({loanId: routeParams.id, resourceType: 'charges', chargeId: routeParams.chargeId}, function (data) {
                        if (data.chargeTimeType.value !== "Specified due date" && data.installmentChargeData) {
                            scope.installmentCharges = data.installmentChargeData;
                            scope.formData.installmentNumber = data.installmentChargeData[0].installmentNumber;
                            scope.installmentchargeField = true;
                        } else {
                            scope.installmentchargeField = false;
                            scope.showwaiveforspecicficduedate = true;
                        }
                    });

                    scope.title = 'label.heading.waiveloancharge';
                    scope.labelName = 'label.input.installment';
                    scope.showNoteField = false;
                    scope.showDateField = false;
                    scope.taskPermissionName = 'WAIVE_LOANCHARGE';
                    break;
                case "paycharge":
                    resourceFactory.LoanAccountResource.get({loanId: routeParams.id, resourceType: 'charges', chargeId: routeParams.chargeId, command: 'pay'}, function (data) {
                        if (data.dueDate) {
                            scope.formData.transactionDate = new Date(data.dueDate);
                        }
                        if (data.chargeTimeType.value === "Instalment Fee" && data.installmentChargeData) {
                            scope.installmentCharges = data.installmentChargeData;
                            scope.formData.installmentNumber = data.installmentChargeData[0].installmentNumber;
                            scope.installmentchargeField = true;
                        }
                    });
                    scope.title = 'label.heading.payloancharge';
                    scope.showNoteField = false;
                    scope.showDateField = false;
                    scope.paymentDatefield = true;
                    scope.taskPermissionName = 'PAY_LOANCHARGE';
                    break;
                case "editcharge":
                    resourceFactory.LoanAccountResource.get({loanId: routeParams.id, resourceType: 'charges', chargeId: routeParams.chargeId}, function (data) {
                        if (data.amountOrPercentage) {
                            scope.showEditChargeAmount = true;
                            scope.formData.amount = data.amountOrPercentage;
                            if (data.dueDate) {
                                scope.formData.dueDate = new Date(data.dueDate);
                                scope.showEditChargeDueDate = true;
                            }
                        }

                    });
                    scope.title = 'label.heading.editcharge';
                    scope.showNoteField = false;
                    scope.showDateField = false;
                    scope.taskPermissionName = 'UPDATE_LOANCHARGE';
                    break;
                case "editdisbursedate":
                    resourceFactory.LoanAccountResource.getLoanAccountDetails({loanId: routeParams.id, associations: 'multiDisburseDetails'}, function (data) {
                        scope.showEditDisburseDate = true;
                        scope.formData.approvedLoanAmount = data.approvedPrincipal;
                        scope.expectedDisbursementDate = new Date(data.timeline.expectedDisbursementDate);
                        for(var i in data.disbursementDetails){
                            if(routeParams.disbursementId == data.disbursementDetails[i].id){
                                scope.formData.updatedExpectedDisbursementDate = new Date(data.disbursementDetails[i].expectedDisbursementDate);
                                scope.formData.updatedPrincipal = data.disbursementDetails[i].principal;
                                scope.id = data.disbursementDetails[i].id;
                            }
                        }
                    });

                    scope.title = 'label.heading.editdisbursedate';
                    scope.showNoteField = false;
                    scope.showDateField = false;
                    scope.taskPermissionName = 'UPDATE_DISBURSEMENTDETAIL';
                    break;
                case "recoverypayment":
                    scope.modelName = 'transactionDate';
                    resourceFactory.loanTrxnsTemplateResource.get({loanId: scope.accountId, command: 'recoverypayment'}, function (data) {
                        scope.paymentTypes = data.paymentTypeOptions;
                        if (data.paymentTypeOptions.length > 0) {
                            scope.formData.paymentTypeId = data.paymentTypeOptions[0].id;
                        }
                        scope.formData.transactionAmount = data.amount;
                        scope.formData[scope.modelName] = new Date();
                    });
                    scope.title = 'label.heading.recoverypayment';
                    scope.labelName = 'label.input.transactiondate';
                    scope.isTransaction = true;
                    scope.showAmountField = true;
                    scope.taskPermissionName = 'RECOVERYPAYMENT_LOAN';
                    break;
                case "adddisbursedetails":
                    resourceFactory.LoanAccountResource.getLoanAccountDetails({loanId: routeParams.id, associations: 'multiDisburseDetails'}, function (data) {
                        scope.addDisburseDetails = true;
                        scope.formData.approvedLoanAmount = data.approvedPrincipal;
                        scope.expectedDisbursementDate = new Date(data.timeline.expectedDisbursementDate);

                        if(data.disbursementDetails != ""){
                            scope.disbursementDetails = data.disbursementDetails;
                        }
                        if (scope.disbursementDetails.length > 0) {
                            for (var i in scope.disbursementDetails) {
                                scope.disbursementDetails[i].expectedDisbursementDate = new Date(scope.disbursementDetails[i].expectedDisbursementDate);
                            }
                        }
                        scope.disbursementDetails.push({
                        });
                    });

                    scope.title = 'label.heading.adddisbursedetails';
                    scope.showNoteField = false;
                    scope.showDateField = false;
                    scope.taskPermissionName = 'UPDATE_DISBURSEMENTDETAIL';
                    break;
                case "deletedisbursedetails":
                    resourceFactory.LoanAccountResource.getLoanAccountDetails({loanId: routeParams.id, associations: 'multiDisburseDetails'}, function (data) {
                        scope.deleteDisburseDetails = true;
                        scope.formData.approvedLoanAmount = data.approvedPrincipal;
                        scope.expectedDisbursementDate = new Date(data.timeline.expectedDisbursementDate);
                        if(data.disbursementDetails != ""){
                            scope.disbursementDetails = data.disbursementDetails;
                        }
                        if (scope.disbursementDetails.length > 0) {
                            for (var i in scope.disbursementDetails) {
                                scope.disbursementDetails[i].expectedDisbursementDate = new Date(scope.disbursementDetails[i].expectedDisbursementDate);
                            }
                        }
                    });

                    scope.title = 'label.heading.deletedisbursedetails';
                    scope.showNoteField = false;
                    scope.showDateField = false;
                    scope.taskPermissionName = 'UPDATE_DISBURSEMENTDETAIL';
                    break;
            }

            scope.cancel = function () {
                location.path('/viewloanaccount/' + routeParams.id);
            };

            scope.addTrancheAmounts = function(){
                scope.showTrancheAmountTotal = 0;
                for(var i in scope.disbursementDetails ){
                    scope.showTrancheAmountTotal += Number(scope.disbursementDetails[i].principal);
                }
            };

            scope.deleteTranches = function (index) {
                scope.disbursementDetails.splice(index, 1);
            };

            scope.addTranches = function () {
                scope.disbursementDetails.push({
                });
            };

            scope.submit = async function () {
                scope.processDate = false;
                var params = {command: scope.action};
                if(scope.action == "recoverguarantee"){
                    params.command = "recoverGuarantees";
                }

                if(scope.action == "approve"){

                    this.formData.expectedDisbursementDate = dateFilter(scope.expectedDisbursementDate, scope.df);
                    if(scope.disbursementDetails != null) {
                        this.formData.disbursementData = [];
                        for (var i in  scope.disbursementDetails) {
                            this.formData.disbursementData.push({
                                id: scope.disbursementDetails[i].id,
                                principal: scope.disbursementDetails[i].principal,
                                expectedDisbursementDate: dateFilter(scope.disbursementDetails[i].expectedDisbursementDate, scope.df),
                                loanChargeId : scope.disbursementDetails[i].loanChargeId
                            });
                        }
                    }
                    if(scope.formData.approvedLoanAmount == null){
                        scope.formData.approvedLoanAmount = scope.showTrancheAmountTotal;
                    }
                }

                if (this.formData[scope.modelName]) {
                    this.formData[scope.modelName] = dateFilter(this.formData[scope.modelName], scope.df);
                }
                if (scope.action != "undoapproval" && scope.action != "undodisbursal" || scope.action === "paycharge") {
                    this.formData.locale = scope.optlang.code;
                    this.formData.dateFormat = scope.df;
                }
                if (scope.action == "repayment" || scope.action == "waiveinterest" || scope.action == "writeoff" || scope.action == "close-rescheduled"
                    || scope.action == "close" || scope.action == "modifytransaction" || scope.action == "recoverypayment" || scope.action == "prepayloan") {
                    if (scope.action == "modifytransaction") {
                        params.command = 'modify';
                        params.transactionId = routeParams.transactionId;
                    }
                    params.loanId = scope.accountId;
                    resourceFactory.loanTrxnsResource.save(params, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                } else if (scope.action == "deleteloancharge") {
                    resourceFactory.LoanAccountResource.delete({loanId: routeParams.id, resourceType: 'charges', chargeId: routeParams.chargeId}, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                } else if (scope.action === "waivecharge") {
                    resourceFactory.LoanAccountResource.save({loanId: routeParams.id, resourceType: 'charges', chargeId: routeParams.chargeId, 'command': 'waive'}, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                } else if (scope.action === "paycharge") {
                    this.formData.transactionDate = dateFilter(this.formData.transactionDate, scope.df);
                    resourceFactory.LoanAccountResource.save({loanId: routeParams.id, resourceType: 'charges', chargeId: routeParams.chargeId, 'command': 'pay'}, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                } else if (scope.action === "editcharge") {
                    this.formData.dueDate = dateFilter(this.formData.dueDate, scope.df);
                    resourceFactory.LoanAccountResource.update({loanId: routeParams.id, resourceType: 'charges', chargeId: routeParams.chargeId}, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                } else if (scope.action === "editdisbursedate") {
                    this.formData.expectedDisbursementDate = dateFilter(this.formData.expectedDisbursementDate, scope.df);
                    for(var i in scope.disbursementDetails){
                        if(scope.disbursementDetails[i].id == scope.id){
                            scope.disbursementDetails[i].principal = scope.formData.updatedPrincipal;
                            scope.disbursementDetails[i].expectedDisbursementDate = dateFilter(scope.formData.updatedExpectedDisbursementDate, scope.df);
                        }
                    }
                    this.formData.disbursementData = [];
                    this.formData.updatedExpectedDisbursementDate = dateFilter(scope.formData.updatedExpectedDisbursementDate, scope.df);
                    this.formData.expectedDisbursementDate = dateFilter(scope.expectedDisbursementDate, scope.df);

                    for (var i in  scope.disbursementDetails) {
                        this.formData.disbursementData.push({
                            id: scope.disbursementDetails[i].id,
                            principal: scope.disbursementDetails[i].principal,
                            expectedDisbursementDate: dateFilter(scope.disbursementDetails[i].expectedDisbursementDate, scope.df),
                            loanChargeId : scope.disbursementDetails[i].loanChargeId
                        });
                    }
                    resourceFactory.LoanEditDisburseResource.update({loanId: routeParams.id, disbursementId: routeParams.disbursementId}, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                }else if(scope.action === "adddisbursedetails" || scope.action === "deletedisbursedetails") {
                    this.formData.disbursementData = [];
                    for (var i in  scope.disbursementDetails) {
                            this.formData.disbursementData.push({
                                id:scope.disbursementDetails[i].id,
                                principal: scope.disbursementDetails[i].principal,
                                expectedDisbursementDate: dateFilter(scope.disbursementDetails[i].expectedDisbursementDate, scope.df),
                                loanChargeId : scope.disbursementDetails[i].loanChargeId
                            });
                    }

                    this.formData.expectedDisbursementDate = dateFilter(scope.expectedDisbursementDate, scope.df);
                    resourceFactory.LoanAddTranchesResource.update({loanId: routeParams.id}, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                }
                else if (scope.action == "deleteloancharge") {
                    resourceFactory.LoanAccountResource.delete({loanId: routeParams.id, resourceType: 'charges', chargeId: routeParams.chargeId}, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                } else {

                    if(scope.action == 'approve'|| scope.action== 'undoapproval'){
                       // alert('Enter Approval flow ')
                    const userId = scope.currentSession.user.userId; // Replace with actual user ID from session or context
                    const endpoint = "http://localhost:3000/api/approvals"
                    scope.msg=''
                    const response = await http.get(endpoint,{params:{loan_id: routeParams.id}});
                   if(!response||!response.data||!response.data.approvers?.length){
                    alert('Network Error / Approvers not Configured in System')
                    scope.cancel()
                    return;
                   }
                   if(scope.action=='undoapproval'){
                        await  http.get(endpoint+'/unapprove',{params:{
                            loan_id:routeParams.id}
                        })
                   }
                   else
                    if(response.data&&!(response.data.status=='approved')){
                        const data = await response.data;
                        //sort by rank
                        var approvers=data.approvers
                        var approvals=data.approvals
                        

                         const approve = async (next) => {
                        
                       await  http.get(endpoint+'/approve',{params:{
                            ...next,loan_id:routeParams.id}
                        })
                       return //alert("Loan approved successfully for userid "+userId+" at Step "+next.rank)
                    }
                        //is  this loan already approved and we are doing an approval undo or are we doing approval for the first time?
                        //all people have approved
            
                        // for first time , set user as approved
                        // are we an approvers? ///approver {active,user_id,rank}  /// approval {loan_id ,user_id,rank}
                        if(!approvers?.filter(a=>a.user_id == userId).length){
                            alert('You are not configured as a loan approver in  the system.Please contact the System Administrator.');
                            scope.msg='Not an approver'
                            scope.cancel();
                            return;
                        }
                         
                            //are we first and none has approved
                            if(!approvals.length ){
                                if( (first=approvers[0]).user_id==userId ){
                                    console.log(first)
                                    console.log(approvers)
                            await approve(first)
                           //  alert('approved for first time')
                             scope.cancel();
                             return;
                            }else{
                                 alert('Pending approval by user '+ first.user_id)
                             scope.cancel();
                             return;
                            }
                        }
                            //are we the next approver
                            
                               var last = approvals?.pop()
                               if(last){
                                var next = approvers[approvers.findIndex(a=>a.user_id==last.user_id&&a.rank==last.rank)+1]
                                if(next){
                                    if(next.user_id==userId){
                                       await approve(next)
                                       //alert('approved other times')
                                         var lstapp = approvers[approvers.length-1]
                                        if(!userId==lstapp.user_id){
                                           if(!(next.rank==lstapp.rank&&next.user_id==lstapp.user_id)) {scope.cancel();return;}
                                        }
                                    }else{
                                        scope.msg='Pending approval by '+next.user_id
                                       // alert(scope.msg)
                                        scope.cancel();
                                        return;
                                    }
                                }else{
                                    // alert('no next approver found')
                                    scope.cancel();
                                }
                               }else{
                                // alert('no previous approver found')
                                scope.cancel();
                                return;
                               }
// alert('passed')
                            }
                        }
                    params.loanId = scope.accountId;
                    resourceFactory.LoanAccountResource.save(params, this.formData, function (data) {
                        location.path('/viewloanaccount/' + data.loanId);
                    });
                }
            };

            scope.$watch('formData.transactionDate',function(){
                scope.onDateChange();
             });

            scope.onDateChange = function(){
                if(scope.processDate) {
                    var params = {};
                    params.locale = scope.optlang.code;
                    params.dateFormat = scope.df;
                    params.transactionDate = dateFilter(this.formData.transactionDate, scope.df);
                    params.loanId = scope.accountId;
                    params.command = 'prepayLoan';
                    resourceFactory.loanTrxnsTemplateResource.get(params, function (data) {
                        scope.formData.transactionAmount = data.amount;
                        if (data.penaltyChargesPortion > 0) {
                            scope.showPenaltyPortionDisplay = true;
                        }
                        scope.principalPortion = data.principalPortion;
                        scope.interestPortion = data.interestPortion;
                    });
                }
            };
        }
    });
   /* mifosX.ng.application.controller('LoanAccountActionsController', ['$scope', 'ResourceFactory', '$location', '$routeParams', 'dateFilter', mifosX.controllers.LoanAccountActionsController]).run(function ($log) {
        $log.info("LoanAccountActionsController initialized");
    });*/
    mifosX.ng.application.config(['$controllerProvider',function($controllerProvider){
        $controllerProvider.register('LoanAccountActionsController', ['$scope', 'ResourceFactory', '$location', '$routeParams', 'dateFilter','$http', mifosX.controllers.LoanAccountActionsControllerx]);
    }]);
}(mifosX.controllers || {}));