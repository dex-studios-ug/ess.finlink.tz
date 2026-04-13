const endpoint="http://localhost:3000";
mifosX.ng.application.config(['$routeProvider', '$locationProvider', 
    function($routeProvider, $locationProvider) {
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
                templateUrl: endpoint+'/templates/ess.html',
                controller: 'ESSViewCtrl'
            })
        $routeProvider
            .when('/viewatmlog', {
                templateUrl: endpoint+'/templates/atm.html',
                controller: 'ATMViewCtrl'
            })
         $routeProvider
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
         
         

        $locationProvider.html5Mode(false);
    }
]);
mifosX.ng.application.controller('ATMViewCtrl', ['$scope', '$http', '$filter', '$window', function($scope, $http, $filter, $window) {
    
    // Initialize scope variables
    $scope.atmLogs = [];
    $scope.loading = false;
    $scope.totalItems = 0;
    $scope.currentPage = 1;
    $scope.pageSize = 20;
    $scope.searchText = '';
    $scope.selectedTransactionType = '';
    $scope.selectedStatus = '';
    $scope.selectedResponseCode = '';
    $scope.showReversedOnly = false;
    $scope.dateFrom = null;
    $scope.dateTo = null;
    $scope.selectedLog = null;
    $scope.stats = {
        total: 0,
        successful: 0,
        failed: 0,
        withdrawals: 0,
        totalAmount: 0,
        balanceInquiries: 0,
        reversed: 0,
        today: 0
    };
    
    // Options
    $scope.transactionTypeOptions = ['WITHDRAWAL', 'BALANCE_INQUIRY'];
    $scope.statusOptions = ['SUCCESS', 'FAILED', 'PROCESSING', 'REVERSED'];
    $scope.responseCodeOptions = ['0', '96', '99'];
      $scope.anySelected =()=>$scope.atmLogs.some(l=>l.selected)
    // Load ATM logs
    $scope.loadATMLogs = function() {
        $scope.loading = true;
        
        var params = {
            page: $scope.currentPage,
            limit: $scope.pageSize,
            search: $scope.searchText,
            transaction_type: $scope.selectedTransactionType,
            status: $scope.selectedStatus,
            response_code: $scope.selectedResponseCode,
            is_reversed: $scope.showReversedOnly
        };
        
        if ($scope.dateFrom) {
            params.date_from = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.date_to = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        $http.post('/logs', params)
            .then(function(response) {
                if (response.data.success) {
                    $scope.atmLogs = response.data.data;
                    $scope.totalItems = response.data.pagination.total;
                }
                $scope.loading = false;
            })
            .catch(function(error) {
                console.error('Error loading ATM logs:', error);
                $scope.errorMessage = 'Failed to load ATM logs';
                $scope.loading = false;
            });
    };
    
    // Load statistics
    $scope.loadStats = function() {
        var params = {};
        if ($scope.dateFrom && $scope.dateTo) {
            params.date_from = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
            params.date_to = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        $http.post('/logs/stats', params)
            .then(function(response) {
                if (response.data.success) {
                    $scope.stats = response.data.data;
                }
            })
            .catch(function(error) {
                console.error('Error loading stats:', error);
            });
    };
    
    // View log details
    $scope.viewDetails = function(log) {
        $scope.selectedLog = angular.copy(log);
        
        // Parse JSON payloads if needed
        if ($scope.selectedLog.request_payload && typeof $scope.selectedLog.request_payload === 'string') {
            try {
                $scope.selectedLog.request_payload = JSON.parse($scope.selectedLog.request_payload);
            } catch(e) {}
        }
        
        if ($scope.selectedLog.response_payload && typeof $scope.selectedLog.response_payload === 'string') {
            try {
                $scope.selectedLog.response_payload = JSON.parse($scope.selectedLog.response_payload);
            } catch(e) {}
        }
        
        $('#atmDetailsModal').modal('show');
    };
    
    // Reverse transaction
    $scope.reverseTransaction = function(log) {
        if (!confirm('Are you sure you want to reverse this transaction?')) return;
        
        var reason = prompt('Please enter reason for reversal:', 'ATM reversal requested');
        if (!reason) return;
        
        $scope.reversingId = log.id;
        
        $http.post('/logs/reverse', {
            reference: log.reference,
            reason: reason
        }).then(function(response) {
            if (response.data.success) {
                $scope.showSuccess('Transaction reversed successfully');
                $scope.loadATMLogs();
                $scope.loadStats();
            } else {
                $scope.showError('Failed to reverse: ' + response.data.error);
            }
            $scope.reversingId = null;
        }).catch(function(error) {
            console.error('Error reversing transaction:', error);
            $scope.showError('Error reversing transaction');
            $scope.reversingId = null;
        });
    };
    
    // Copy to clipboard
    $scope.copyToClipboard = function(text) {
        var textArea = document.createElement('textarea');
        textArea.value = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        $scope.showSuccess('Copied to clipboard!');
    };
    
    // Delete log
    $scope.deleteLog = function(log) {
        if (confirm('Are you sure you want to delete this log?')) {
            $http.delete('/logs/' + log.id)
                .then(function(response) {
                    if (response.data.success) {
                        $scope.showSuccess('Log deleted successfully');
                        $scope.loadATMLogs();
                        $scope.loadStats();
                    }
                })
                .catch(function(error) {
                    console.error('Error deleting log:', error);
                    $scope.showError('Failed to delete log');
                });
        }
    };
    
    // Bulk delete
    $scope.bulkDelete = function() {
        var selected = $scope.atmLogs.filter(function(log) { return log.selected; });
        if (selected.length === 0) {
            $scope.showError('Please select at least one log to delete');
            return;
        }
        
        if (confirm('Are you sure you want to delete ' + selected.length + ' log(s)?')) {
            var ids = selected.map(function(log) { return log.id; });
            $http.post('/logs/bulk-delete', { ids: ids })
                .then(function(response) {
                    if (response.data.success) {
                        $scope.loadATMLogs();
                        $scope.loadStats();
                        $scope.showSuccess(response.data.message);
                    }
                })
                .catch(function(error) {
                    console.error('Error bulk deleting logs:', error);
                    $scope.showError('Failed to delete logs');
                });
        }
    };
    
    // Select all
    $scope.selectAll = function() {
        angular.forEach($scope.atmLogs, function(log) {
            log.selected = $scope.allSelected;
        });
    };
    
    $scope.$watch('allSelected', function(newValue) {
        if ($scope.atmLogs) {
            angular.forEach($scope.atmLogs, function(log) {
                log.selected = newValue;
            });
        }
    });
    
    // Export to CSV
    $scope.exportToCSV = function() {
        var params = {
            search: $scope.searchText,
            transaction_type: $scope.selectedTransactionType,
            status: $scope.selectedStatus,
            response_code: $scope.selectedResponseCode
        };
        
        if ($scope.dateFrom) {
            params.date_from = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.date_to = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        // Create form and submit
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = '/logs/export';
        form.style.display = 'none';
        
        var input = document.createElement('input');
        input.name = 'params';
        input.value = JSON.stringify(params);
        form.appendChild(input);
        
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    };
    
    // Apply filters
    $scope.applyFilters = function() {
        $scope.currentPage = 1;
        $scope.loadATMLogs();
        $scope.loadStats();
    };
    
    // Reset filters
    $scope.resetFilters = function() {
        $scope.searchText = '';
        $scope.selectedTransactionType = '';
        $scope.selectedStatus = '';
        $scope.selectedResponseCode = '';
        $scope.showReversedOnly = false;
        $scope.dateFrom = null;
        $scope.dateTo = null;
        $scope.currentPage = 1;
        $scope.loadATMLogs();
        $scope.loadStats();
    };
    
    // Page changed
    $scope.pageChanged = function() {
        $scope.loadATMLogs();
    };
    
    // Refresh
    $scope.refresh = function() {
        $scope.loadATMLogs();
        $scope.loadStats();
    };
    
    // Helper functions
    $scope.getStatusClass = function(status) {
        var classes = {
            'SUCCESS': 'badge-success',
            'FAILED': 'badge-danger',
            'PROCESSING': 'badge-warning',
            'REVERSED': 'badge-secondary'
        };
        return classes[status] || 'badge-secondary';
    };
    
    $scope.getResponseCodeClass = function(code) {
        if (code === '0') return 'badge-success';
        if (code === '96') return 'badge-danger';
        if (code === '99') return 'badge-warning';
        return 'badge-secondary';
    };
    
    $scope.formatAmount = function(amount) {
        if (!amount) return '-';
        return new Intl.NumberFormat('en-TZ', {
            style: 'currency',
            currency: 'TZS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };
    
    $scope.showSuccess = function(message) {
        $scope.successMessage = message;
        setTimeout(function() {
            $scope.$apply(function() {
                $scope.successMessage = null;
            });
        }, 3000);
    };
    
    $scope.showError = function(message) {
        $scope.errorMessage = message;
        setTimeout(function() {
            $scope.$apply(function() {
                $scope.errorMessage = null;
            });
        }, 3000);
    };
    
    // Initial load
    $scope.loadATMLogs();
    $scope.loadStats();
}]);
mifosX.ng.application.controller('ESSViewCtrl', ['$scope', '$http', '$filter', '$window', function($scope, $http, $filter, $window) {
    
    // Initialize scope variables
    $scope.essLogs = [];
    $scope.loading = false;
    $scope.totalItems = 0;
    $scope.currentPage = 1;
    $scope.pageSize = 20;
    $scope.searchText = '';
    $scope.selectedMessageType = '';
    $scope.selectedDirection = '';
    $scope.selectedStatus = '';
    $scope.dateFrom = null;
    $scope.dateTo = null;
    $scope.selectedLog = null;
    $scope.stats = {
        total: 0,
        success: 0,
        failed: 0,
        pending: 0,
        inbound: 0,
        outbound: 0
    };
    
    // Message type options (from MSG constants)
    $scope.messageTypeOptions = [
        // Product Catalog
        'PRODUCT_DETAIL',
        'PRODUCT_DECOMMISSION',
        
        // New Loan
        'LOAN_CHARGES_REQUEST',
        'LOAN_OFFER_REQUEST',
        'LOAN_INITIAL_APPROVAL_NOTIFICATION',
        'LOAN_FINAL_APPROVAL_NOTIFICATION',
        'LOAN_DISBURSEMENT_NOTIFICATION',
        'LOAN_DISBURSEMENT_FAILURE_NOTIFICATION',
        'LOAN_CANCELLATION_NOTIFICATION',
        
        // Top Up
        'TOP_UP_PAY_OFF_BALANCE_REQUEST',
        'TOP_UP_OFFER_REQUEST',
        
        // Restructuring
        'LOAN_RESTRUCTURE_BALANCE_REQUEST',
        'LOAN_RESTRUCTURE_REQUEST_FSP',
        'LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST',
        'LOAN_RESTRUCTURE_REQUEST',
        'LOAN_RESTRUCTURE_REJECTION',
        'LOAN_RESTRUCTURED_NOTIFICATION',
        'LOAN_RESTRUCTURED_FAILURE_NOTIFICATION',
        
        // Takeover
        'TAKEOVER_PAY_OFF_BALANCE_REQUEST',
        'LOAN_TAKEOVER_OFFER_REQUEST',
        'LOAN_TAKEOVER_APPROVAL_NOTIFICATION',
        'TAKEOVER_DISBURSEMENT_NOTIFICATION',
        'TAKEOVER_PAYMENT_NOTIFICATION',
        'PAYMENT_ACKNOWLEDGMENT_NOTIFICATION',
        
        // Repayments
        'FSP_REPAYMENT_REQUEST',
        'REPAYMENT_OFF_BALANCE_REQUEST_TO_FSP',
        'FULL_LOAN_REPAYMENT_REQUEST',
        'FULL_LOAN_REPAYMENT_NOTIFICATION',
        'PARTIAL_LOAN_REPAYMENT_REQUEST',
        'PARTIAL_LOAN_REPAYMENT_NOTIFICATION',
        'FSP_MONTHLY_DEDUCTIONS',
        'LOAN_LIQUIDATION_NOTIFICATION',
        
        // Status
        'LOAN_STATUS_REQUEST',
        
        // Defaults
        'DEFAULTER_DETAILS_TO_EMPLOYER',
        'DEFAULTER_DETAILS_TO_FSP',
        'DEDUCTION_STOP_NOTIFICATION',
        
        // Account & Branches
        'ACCOUNT_VALIDATION',
        'FSP_BRANCHES',
        
    ];
      $scope.anySelected =()=>$scope.essLogs.some(l=>l.selected)
    
    $scope.directionOptions = ['INBOUND', 'OUTBOUND'];
    $scope.statusOptions = ['SUCCESS', 'FAILED', 'PENDING', 'PROCESSING'];
    
    // Load ESS logs
    $scope.loadESSLogs = function() {
        $scope.loading = true;
        
        var params = {
            page: $scope.currentPage,
            limit: $scope.pageSize,
            search: $scope.searchText,
            messageType: $scope.selectedMessageType,
            direction: $scope.selectedDirection,
            status: $scope.selectedStatus
        };
        
        if ($scope.dateFrom) {
            params.dateFrom = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.dateTo = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        $http.get('/api/ess/logs', { params: params })
            .then(function(response) {
                $scope.essLogs = response.data.data || response.data;
                $scope.totalItems = response.data.total || response.data.length;
                $scope.loading = false;
            })
            .catch(function(error) {
                console.error('Error loading ESS logs:', error);
                $scope.errorMessage = 'Failed to load ESS logs';
                $scope.loading = false;
            });
    };
    
    // Load statistics
    $scope.loadStats = function() {
        $http.get('/api/ess/stats')
            .then(function(response) {
                $scope.stats = response.data;
            })
            .catch(function(error) {
                console.error('Error loading stats:', error);
            });
    };
    
    // Resend message to ESS
    $scope.resendToESS = function(log) {
        if (!log || !log.id) return;
        
        $scope.resendingId = log.id;
        
        $http.post('/api/ess/logs/' + log.id + '/resend')
            .then(function(response) {
                if (response.data.success) {
                    log.status = 'PENDING';
                    log.retry_count = (log.retry_count || 0) + 1;
                    $scope.showSuccess('Message resent to ESS successfully');
                    $scope.loadESSLogs();
                    $scope.loadStats();
                } else {
                    $scope.showError('Failed to resend message: ' + (response.data.error || 'Unknown error'));
                }
                $scope.resendingId = null;
            })
            .catch(function(error) {
                console.error('Error resending message:', error);
                $scope.showError('Error resending message');
                $scope.resendingId = null;
            });
    };
    
    // View message details
    $scope.viewDetails = function(log) {
        $scope.selectedLog = angular.copy(log);
        
        // Format payload for display
        if ($scope.selectedLog.request_payload) {
            try {
                $scope.selectedLog.formattedRequest = JSON.stringify(
                    JSON.parse($scope.selectedLog.request_payload), 
                    null, 2
                );
            } catch(e) {
                $scope.selectedLog.formattedRequest = $scope.selectedLog.request_payload;
            }
        }
        
        if ($scope.selectedLog.response_payload) {
            try {
                $scope.selectedLog.formattedResponse = JSON.stringify(
                    JSON.parse($scope.selectedLog.response_payload), 
                    null, 2
                );
            } catch(e) {
                $scope.selectedLog.formattedResponse = $scope.selectedLog.response_payload;
            }
        }
        
        $('#essDetailsModal').modal('show');
    };
    
    // View raw XML
    $scope.viewRawXML = function(payload) {
        $scope.rawXML = payload;
        $('#rawXMLModal').modal('show');
    };
    
    // Apply filters
    $scope.applyFilters = function() {
        $scope.currentPage = 1;
        $scope.loadESSLogs();
    };
    
    // Reset filters
    $scope.resetFilters = function() {
        $scope.searchText = '';
        $scope.selectedMessageType = '';
        $scope.selectedDirection = '';
        $scope.selectedStatus = '';
        $scope.dateFrom = null;
        $scope.dateTo = null;
        $scope.currentPage = 1;
        $scope.loadESSLogs();
    };
    
    // Export to CSV
    $scope.exportToCSV = function() {
        var params = {
            search: $scope.searchText,
            messageType: $scope.selectedMessageType,
            direction: $scope.selectedDirection,
            status: $scope.selectedStatus
        };
        
        if ($scope.dateFrom) {
            params.dateFrom = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.dateTo = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        $window.location.href = '/api/ess/export?' + $.param(params);
    };
    
    // Delete log
    $scope.deleteLog = function(log) {
        if (confirm('Are you sure you want to delete this log?')) {
            $http.delete('/api/ess/logs/' + log.id)
                .then(function(response) {
                    if (response.data.success) {
                        $scope.loadESSLogs();
                        $scope.loadStats();
                        $scope.showSuccess('Log deleted successfully');
                    }
                })
                .catch(function(error) {
                    console.error('Error deleting log:', error);
                    $scope.showError('Failed to delete log');
                });
        }
    };
    
    // Bulk delete
    $scope.bulkDelete = function() {
        var selected = $scope.essLogs.filter(function(log) { return log.selected; });
        if (selected.length === 0) {
            $scope.showError('Please select at least one log to delete');
            return;
        }
        
        if (confirm('Are you sure you want to delete ' + selected.length + ' log(s)?')) {
            var ids = selected.map(function(log) { return log.id; });
            $http.post('/api/ess/logs/bulk-delete', { ids: ids })
                .then(function(response) {
                    if (response.data.success) {
                        $scope.loadESSLogs();
                        $scope.loadStats();
                        $scope.showSuccess('Logs deleted successfully');
                    }
                })
                .catch(function(error) {
                    console.error('Error bulk deleting logs:', error);
                    $scope.showError('Failed to delete logs');
                });
        }
    };
    
    // Select all checkboxes
    $scope.selectAll = function() {
        angular.forEach($scope.essLogs, function(log) {
            log.selected = $scope.allSelected;
        });
    };
    
    // Watch for select all changes
    $scope.$watch('allSelected', function(newValue) {
        if ($scope.essLogs) {
            angular.forEach($scope.essLogs, function(log) {
                log.selected = newValue;
            });
        }
    });
    
    // Get status badge class
    $scope.getStatusClass = function(status) {
        switch(status) {
            case 'SUCCESS': return 'badge-success';
            case 'FAILED': return 'badge-danger';
            case 'PENDING': return 'badge-warning';
            case 'PROCESSING': return 'badge-info';
            default: return 'badge-secondary';
        }
    };
    
    // Get direction badge class
    $scope.getDirectionClass = function(direction) {
        return direction === 'INBOUND' ? 'badge-primary' : 'badge-success';
    };
    
    // Show success message
    $scope.showSuccess = function(message) {
        $scope.successMessage = message;
        setTimeout(function() {
            $scope.$apply(function() {
                $scope.successMessage = null;
            });
        }, 3000);
    };
    
    // Show error message
    $scope.showError = function(message) {
        $scope.errorMessage = message;
        setTimeout(function() {
            $scope.$apply(function() {
                $scope.errorMessage = null;
            });
        }, 3000);
    };
    
    // Page changed handler
    $scope.pageChanged = function() {
        $scope.loadESSLogs();
    };
    
    // Refresh data
    $scope.refresh = function() {
        $scope.loadESSLogs();
        $scope.loadStats();
    };
    
    // Initial load
    $scope.loadESSLogs();
    $scope.loadStats();
}]);

mifosX.ng.application.controller('CRDBViewCtrl', ['$scope', '$http', '$filter', '$window', function($scope, $http, $filter, $window) {
    
    // Initialize scope variables
    $scope.crdbendpoint="http://localhost:3000/api/crdb"
    $scope.crdbLogs = [];
    $scope.loading = false;
    $scope.totalItems = 0;
    $scope.currentPage = 1;
    $scope.pageSize = 20;
    $scope.searchText = '';
    $scope.selectedCode = '';
    $scope.selectedEndpoint = '';
    $scope.selectedStatus = '';
    $scope.selectedPartnerId = '';
    $scope.dateFrom = null;
    $scope.dateTo = null;
    $scope.selectedLog = null;
    $scope.stats = {
        total: 0,
        success: 0,
        failed: 0,
        pending: 0,
        totalAmount: 0,
        avgResponseTime: 0
    };
    
    // CRDB Code Options
    $scope.codeOptions = [
        { code: 'CRDB01', description: 'Single Disbursement' },
        { code: 'CRDB02', description: 'Transaction Status Check' },
        { code: 'CRDB03', description: 'Account Details' },
        { code: 'CRDB04', description: 'USSD Push' },
        { code: 'CRDB07', description: 'Verify Batch' },
        { code: 'CRDB08', description: 'Approve Batch' },
        { code: 'CRDB09', description: 'List Batch Records' }
    ];
    
    // Endpoint Options
    $scope.endpointOptions = [
        '/disbursement',
        '/transaction/status',
        '/account/details',
        '/ussd/push',
        '/ussd/callback',
        '/batch',
        '/batch/verify',
        '/batch/list',
        '/batch/approve',
        '/batch/callback',
        '/batch/status',
        '/transactions'
    ];
     $scope.anySelected =()=>$scope.crdbLogs.some(l=>l.selected)
    
    $scope.statusOptions = ['200', '400', '401', '403', '404', '500', '502', '503'];
    
    // Load CRDB logs
    $scope.loadCRDBLogs = function() {
        $scope.loading = true;
        
        var params = {
            page: $scope.currentPage,
            limit: $scope.pageSize,
            search: $scope.searchText,
            code: $scope.selectedCode,
            endpoint: $scope.selectedEndpoint,
            status: $scope.selectedStatus,
            partnerId: $scope.selectedPartnerId
        };
        
        if ($scope.dateFrom) {
            params.dateFrom = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.dateTo = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        $http.post('/logs', params)
            .then(function(response) {
                $scope.crdbLogs = response.data.data || response.data;
                $scope.totalItems = response.data.total || response.data.length;
                $scope.loading = false;
            })
            .catch(function(error) {
                console.error('Error loading CRDB logs:', error);
                $scope.errorMessage = 'Failed to load CRDB logs';
                $scope.loading = false;
            });
    };
    
    // Load statistics
    $scope.loadStats = function() {
        $http.post('/stats', {})
            .then(function(response) {
                $scope.stats = response.data;
            })
            .catch(function(error) {
                console.error('Error loading stats:', error);
            });
    };
    
    // Retry failed transaction
    $scope.retryTransaction = function(log) {
        if (!log || !log.id) return;
        
        $scope.retryingId = log.id;
        
        $http.post('/logs/' + log.id + '/retry')
            .then(function(response) {
                if (response.data.success) {
                    $scope.showSuccess('Transaction retried successfully');
                    $scope.loadCRDBLogs();
                    $scope.loadStats();
                } else {
                    $scope.showError('Failed to retry: ' + (response.data.error || 'Unknown error'));
                }
                $scope.retryingId = null;
            })
            .catch(function(error) {
                console.error('Error retrying transaction:', error);
                $scope.showError('Error retrying transaction');
                $scope.retryingId = null;
            });
    };
    
    // View message details
    $scope.viewDetails = function(log) {
        $scope.selectedLog = angular.copy(log);
        
        // Format payload for display
        if ($scope.selectedLog.request_payload) {
            try {
                $scope.selectedLog.formattedRequest = JSON.stringify(
                    JSON.parse($scope.selectedLog.request_payload), 
                    null, 2
                );
            } catch(e) {
                $scope.selectedLog.formattedRequest = $scope.selectedLog.request_payload;
            }
        }
        
        if ($scope.selectedLog.response_payload) {
            try {
                $scope.selectedLog.formattedResponse = JSON.stringify(
                    JSON.parse($scope.selectedLog.response_payload), 
                    null, 2
                );
            } catch(e) {
                $scope.selectedLog.formattedResponse = $scope.selectedLog.response_payload;
            }
        }
        
        $('#crdbDetailsModal').modal('show');
    };
    
    // Apply filters
    $scope.applyFilters = function() {
        $scope.currentPage = 1;
        $scope.loadCRDBLogs();
    };
    
    // Reset filters
    $scope.resetFilters = function() {
        $scope.searchText = '';
        $scope.selectedCode = '';
        $scope.selectedEndpoint = '';
        $scope.selectedStatus = '';
        $scope.selectedPartnerId = '';
        $scope.dateFrom = null;
        $scope.dateTo = null;
        $scope.currentPage = 1;
        $scope.loadCRDBLogs();
    };
    
    // Export to CSV
    $scope.exportToCSV = function() {
        var params = {
            search: $scope.searchText,
            code: $scope.selectedCode,
            endpoint: $scope.selectedEndpoint,
            status: $scope.selectedStatus,
            partnerId: $scope.selectedPartnerId
        };
        
        if ($scope.dateFrom) {
            params.dateFrom = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.dateTo = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        $window.location.href = '/export?' + $.param(params);
    };
    
    // Delete log
    $scope.deleteLog = function(log) {
        if (confirm('Are you sure you want to delete this log?')) {
            $http.delete('/logs/' + log.id)
                .then(function(response) {
                    if (response.data.success) {
                        $scope.loadCRDBLogs();
                        $scope.loadStats();
                        $scope.showSuccess('Log deleted successfully');
                    }
                })
                .catch(function(error) {
                    console.error('Error deleting log:', error);
                    $scope.showError('Failed to delete log');
                });
        }
    };
    
    // Bulk delete
    $scope.bulkDelete = function() {
        var selected = $scope.crdbLogs.filter(function(log) { return log.selected; });
        if (selected.length === 0) {
            $scope.showError('Please select at least one log to delete');
            return;
        }
        
        if (confirm('Are you sure you want to delete ' + selected.length + ' log(s)?')) {
            var ids = selected.map(function(log) { return log.id; });
            $http.post('/logs/bulk-delete', { ids: ids })
                .then(function(response) {
                    if (response.data.success) {
                        $scope.loadCRDBLogs();
                        $scope.loadStats();
                        $scope.showSuccess('Logs deleted successfully');
                    }
                })
                .catch(function(error) {
                    console.error('Error bulk deleting logs:', error);
                    $scope.showError('Failed to delete logs');
                });
        }
    };
    
    // Select all checkboxes
    $scope.selectAll = function() {
        angular.forEach($scope.crdbLogs, function(log) {
            log.selected = $scope.allSelected;
        });
    };
    
    // Watch for select all changes
    $scope.$watch('allSelected', function(newValue) {
        if ($scope.crdbLogs) {
            angular.forEach($scope.crdbLogs, function(log) {
                log.selected = newValue;
            });
        }
    });
    
    // Get status badge class
    $scope.getStatusClass = function(status) {
        if (status >= 200 && status < 300) return 'badge-success';
        if (status >= 400 && status < 500) return 'badge-warning';
        if (status >= 500) return 'badge-danger';
        return 'badge-secondary';
    };
    
    // Get code badge class
    $scope.getCodeClass = function(code) {
        const codeMap = {
            'CRDB01': 'badge-primary',
            'CRDB02': 'badge-info',
            'CRDB03': 'badge-info',
            'CRDB04': 'badge-success',
            'CRDB07': 'badge-warning',
            'CRDB08': 'badge-danger',
            'CRDB09': 'badge-secondary'
        };
        return codeMap[code] || 'badge-secondary';
    };
    
    // Get code description
    $scope.getCodeDescription = function(code) {
        var option = $scope.codeOptions.find(function(opt) { return opt.code === code; });
        return option ? option.description : code;
    };
    
    // Format amount
    $scope.formatAmount = function(amount, currency) {
        if (!amount) return '-';
        return new Intl.NumberFormat('en-TZ', {
            style: 'currency',
            currency: currency || 'TZS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };
    
    // Format duration
    $scope.formatDuration = function(ms) {
        if (!ms) return '-';
        if (ms < 1000) return ms + 'ms';
        return (ms / 1000).toFixed(2) + 's';
    };
    
    // Show success message
    $scope.showSuccess = function(message) {
        $scope.successMessage = message;
        setTimeout(function() {
            $scope.$apply(function() {
                $scope.successMessage = null;
            });
        }, 3000);
    };
    
    // Show error message
    $scope.showError = function(message) {
        $scope.errorMessage = message;
        setTimeout(function() {
            $scope.$apply(function() {
                $scope.errorMessage = null;
            });
        }, 3000);
    };
    
    // Page changed handler
    $scope.pageChanged = function() {
        $scope.loadCRDBLogs();
    };
    
    // Refresh data
    $scope.refresh = function() {
        $scope.loadCRDBLogs();
        $scope.loadStats();
    };
    
    // Initial load
    $scope.loadCRDBLogs();
    $scope.loadStats();
}]);