(function (module) {
    mifosX.controllers = _.extend(module, {
        NotificationsControllerx: function (
            $scope,
            $rootScope,
            $http,
            $location,
            $timeout,
            localStorageService
        ) {
            const notificationsendpoint = "http://localhost:3000/api/notify";


            var objTypeUrlMap = {
                'client': '/viewclient/',
                'group': '/viewgroup/',
                'loan': '/viewloanaccount/',
                'shareAccount': '/viewshareaccount/',
                'fixedDeposit': 'viewfixeddepositaccount/',
                'recurringDepositAccount': '/viewrecurringdepositaccount/',
                'shareProduct': '/viewshareproduct/',
                'savingsAccount': '/viewsavingaccount/',
                'center': '/viewcenter/',
                'loanProduct': '/viewloanproduct/'
            };

            $scope.notifications = [];
            $scope.notificationsPerPage = 15;
            $scope.numberOfUnreadNotifications = 0;
            $scope.counter = 0;

            // Example: get from logged-in user context
            $rootScope.currentUser=$scope?.currentSession?.user||1;
            var userId = $rootScope.currentUser?.userId||1;
            var userRole = $rootScope.currentUser?.roles?.[0].name;
            $scope.notifications = [];
            $scope.notificationsPerPage = 15;
            $scope.notificationsItmesInATray = 5;
            $scope.isNotificationIconRed = true;
            $scope.numberOfUnreadNotifications = 0;
            $scope.counter = 0;
            $scope.initNotificationTray = function() {
                var readNotifications = null;// localStorageService.getFromLocalStorage("notifications");
                if (readNotifications == null) {
                    //$scope.initNotificationsPage();
                } else {
                    $scope.notifications = readNotifications;
                }

                if ($scope.numberOfUnreadNotifications > 0 ) {
                    //resourceFactory.notificationsResource.update();
                    $scope.numberOfUnreadNotifications = 0;
                }
            };

            // 🔹 Fetch all notifications (paginated + filtered)
            $scope.initNotificationsPage = function () {
                $http.get(notificationsendpoint + '/notifications', {
                    params: {
                        offset: 0,
                        limit: $scope.notificationsPerPage,
                        userId: userId,
                        userRole: userRole
                    }
                }).then(function (res) {
                    $scope.notifications = res.data.notifications//.filter(n => n.read).concat($scope.notifications);
                    localStorageService.addToLocalStorage(
                        "notifications",
                        JSON.stringify($scope.notifications)
                    );
                });
            };
            $scope.unread=()=>{
                $scope.numberOfUnreadNotifications = $scope.notifications.filter(n => !n.read).length;
            }

            // 🔹 Pagination
            $scope.getResultsPage = function (pageNumber) {
                $http.get(notificationsendpoint + '/notifications', {
                    params: {
                        offset: (pageNumber - 1) * $scope.notificationsPerPage,
                        limit: $scope.notificationsPerPage,
                        userId: userId,
                        userRole: userRole
                    }
                }).then(function (res) {
                    $scope.notifications = res.data.notifications;
                    $scope.unread();
                    localStorageService.addToLocalStorage(
                        "notifications",
                        JSON.stringify($scope.notifications)
                    );
                });
            };
            $scope.fetchItemsInNotificationTray = function() {
                  $scope.initNotificationTray();
            };

            // 🔹 Fetch unread notifications
           $scope.fetchItemsInNotificationTray = $scope.fetchUnreadNotifications = function () {
                $http.get(notificationsendpoint + '/notifications', {
                    params: {
                        toUserId: userId,
                        toUserRole: userRole
                    }
                }).then(function (res) {
                    const all = res.data.notifications || [];

                    const unread = all.filter(n => !n.read);
                    $scope.numberOfUnreadNotifications = unread.length;

                    // Merge with local storage (like your original logic)
                    let stored = [];//localStorageService.getFromLocalStorage("notifications") || "[]";

                    //stored = JSON.parse(stored);

                    unread.forEach(n => {
                        stored = stored.filter(s => s.id !== n.id);
                    });

                    $scope.notifications = unread.concat(
                        stored.slice(0, Math.abs(stored.length - unread.length))
                    );
                    $scope.unread();

                    localStorageService.addToLocalStorage(
                        "notifications",
                        JSON.stringify($scope.notifications)
                    );
                });
            };

            // 🔹 Mark notifications as read
            $scope.markAsRead = function (ids) {
                $http.post(notificationsendpoint + '/notifications/mark-read', {
                    notificationIds: ids
                }).then(function () {
                    $scope.fetchUnreadNotifications();
                });
            };

            // 🔹 Navigation
            $scope.navigateToAction = function (notification) {
                $scope.markAsRead([notification.id]);
                if (!notification.objectType || typeof notification.objectType !== 'string') {
                    console.error('no object type found');
                    return;
                }
                if (!objTypeUrlMap[notification.objectType]) {
                    return;
                }
                $location.path(objTypeUrlMap[notification.objectType] + notification.objectId);
            };

            // 🔹 Polling every 60s
            $scope.countFromLastResponse = function () {
                $scope.counter++;
                if ($scope.counter === 30) {
                    $scope.counter = 0;
                    $scope.fetchUnreadNotifications();
                }
                $scope.timer = $timeout($scope.countFromLastResponse, 1000);
            };

            // 🔹 Init
            $scope.init = function () {
                localStorageService.removeFromLocalStorage("notifications");
                $scope.initNotificationsPage();
                $scope.unread();
                $scope.initNotificationTray();
                $scope.fetchUnreadNotifications();
                $scope.countFromLastResponse();
            };

            // 🔹 Events
            $scope.$on('eventFired', function (event, data) {
                $scope.counter = 0;
                if (data.notificationStatus === "true") {
                    $scope.fetchUnreadNotifications();
                }
            });

            $scope.$on("UserAuthenticationSuccessEvent", function () {
                $timeout.cancel($scope.timer);
                localStorageService.removeFromLocalStorage("notifications");
                $scope.init();
            });

            $scope.$on("UserLogoutSuccessEvent", function () {
                $timeout.cancel($scope.timer);
                localStorageService.removeFromLocalStorage("notifications");    });
                 $timeout.cancel($scope.timer);
                localStorageService.removeFromLocalStorage("notifications");
                $scope.init();
               

        }
    });

   /* mifosX.ng.application.controller('NotificationsController', [
        '$scope',
        '$rootScope',
        '$http',
        '$location',
        '$timeout',
        'localStorageService',
        mifosX.controllers.NotificationsControllerx
    ]).run(['$log', function ($log) {
        $log.info("NotificationsController initialized");
    }]);*/

}(mifosX.controllers || {}));
  
mifosX.ng.application.config(['$controllerProvider',function($controllerProvider){
    $controllerProvider.register("NotificationsController", [
        '$scope',
        '$rootScope',
        '$http',
        '$location',
        '$timeout',
        'localStorageService',
        mifosX.controllers.NotificationsControllerx
    ]);
}]);
