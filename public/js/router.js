
mifosX.ng.application.config(['$routeProvider', '$locationProvider', 
    function($routeProvider, $locationProvider) {
        const endpoint="http://localhost:3000";
        $routeProvider
            .when('/viewsmslog', {
                templateUrl: endpoint+'/templates/sms.html',
                controller: 'SMSViewCtrl'
            })
        $routeProvider
            .when('/viewcrdblog', {
                templateUrl: endpoint+'/templates/crdb.html',
                controller: 'CRDBViewCtrl'
            })
        $routeProvider
            .when('/viewesslog', {
                templateUrl: endpoint+'/templates/test/ess.html',
                controller: 'ESSViewCtrl'
            })
        $routeProvider
            .when('/viewatmlog', {
                templateUrl: endpoint+'/templates/atm.html',
                controller: 'ATMViewCtrl'
            })
        /* $routeProvider
            .when('/viewcrdbportal', {
                templateUrl: endpoint+'/ui/crdb.html',
                controller: 'CRDBViewCtrl'
            })
        $routeProvider
            .when('/viewessportal', {
                templateUrl: endpoint+'/ui/ess.html',
                controller: 'ESSViewCtrl'
            })
        $routeProvider
            .when('/viewatmportal', {
                templateUrl: endpoint+'/ui/atm.html',
                controller: 'ATMViewCtrl'
            })
                */
            .otherwise({
                redirectTo: '/'
             });
         
         

        $locationProvider.html5Mode(false);
    }
]);


