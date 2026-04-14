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