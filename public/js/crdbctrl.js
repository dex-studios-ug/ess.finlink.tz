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