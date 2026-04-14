mifosX.ng.application.controller('ATMViewCtrl', ['$scope', '$http', '$filter', '$window', function($scope, $http, $filter, $window) {
    const atmendpoint = 'http://localhost:3000/api/atm'
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
