const BACKEND="https://${window.location.hostname}:8334";
let notif,campgn,loanApprovalAndDisbursement


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const loanapprovalendpoint = "http://localhost:3000/api/approvals";


/*/////////////////////Override from Here//////////////////////////
mifosX.ng.application.config(['$controllerProvider',function($controllerProvider){
    $controllerProvider.register("ViewLoanDetailsController",loanApprovalAndDisbursement)
$controllerProvider.register("NotificationsController",notif)
$controllerProvider.register("CreateSmsCampaignController",campgn)
}]);
*/