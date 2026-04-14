// ESS View Controller - Complete with all FSP Loan Actions
// Compatible with AngularJS 1.5.x and Bootstrap 3

mifosX.ng.application.controller('ESSViewCtrl', [
    '$scope', '$http', '$filter', '$window', '$timeout', 'webStorage',
    function($scope, $http, $filter, $window, $timeout, webStorage) {
    
    'use strict';
    $scope.endpoint = "http://localhost:3000";
    
    // ==================== SCOPE VARIABLES ====================
    
    // Tab state
    $scope.activeTab = webStorage.get('ess.activeTab') || 'logs';
    
    // Logs section
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
    $scope.resendingId = null;
    $scope.allSelected = false;
    
    // Loans section
    $scope.allLoans = [];
    $scope.filteredLoans = [];
    $scope.activeLoans = [];
    $scope.loansLoading = false;
    $scope.loanSearchText = '';
    $scope.loanStatusFilter = '';
    $scope.productFilter = '';
    $scope.loanProducts = [];
    $scope.selectedLoan = null;
    $scope.loanDetails = null;
    $scope.loanDetailsLoading = false;
    
    // Statistics
    $scope.stats = {
        total: 0,
        success: 0,
        failed: 0,
        pending: 0,
        inbound: 0,
        outbound: 0
    };
    
    $scope.loanStats = {
        total: 0,
        active: 0,
        overdue: 0,
        totalOutstanding: 0
    };
    
    // Modal data
    $scope.repaymentLoan = null;
    $scope.repaymentAmount = null;
    $scope.repaymentDate = null;
    $scope.paymentMethod = 'SALARY_DEDUCTION';
    $scope.repaymentNotes = '';
    $scope.repaymentSubmitting = false;
    
    $scope.restructureLoan = null;
    $scope.newTenure = null;
    $scope.newInstallmentAmount = null;
    $scope.restructureReason = '';
    $scope.restructureSubmitting = false;
    
    $scope.topupLoan = null;
    $scope.topupAmount = null;
    $scope.topupProductCode = null;
    $scope.settlementAmount = null;
    $scope.topupSubmitting = false;
    
    // ==================== MESSAGE TYPE OPTIONS ====================
    
    $scope.messageTypeOptions = [
        // Product Catalog
        'PRODUCT_DETAIL', 'PRODUCT_DECOMMISSION',
        // New Loan
        'LOAN_CHARGES_REQUEST', 'LOAN_OFFER_REQUEST', 'LOAN_INITIAL_APPROVAL_NOTIFICATION',
        'LOAN_FINAL_APPROVAL_NOTIFICATION', 'LOAN_DISBURSEMENT_NOTIFICATION',
        'LOAN_DISBURSEMENT_FAILURE_NOTIFICATION', 'LOAN_CANCELLATION_NOTIFICATION',
        // Top Up
        'TOP_UP_PAY_OFF_BALANCE_REQUEST', 'TOP_UP_OFFER_REQUEST',
        // Restructuring
        'LOAN_RESTRUCTURE_BALANCE_REQUEST', 'LOAN_RESTRUCTURE_REQUEST_FSP',
        'LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST', 'LOAN_RESTRUCTURE_REQUEST',
        'LOAN_RESTRUCTURE_REJECTION', 'LOAN_RESTRUCTURED_NOTIFICATION',
        'LOAN_RESTRUCTURED_FAILURE_NOTIFICATION',
        // Takeover
        'TAKEOVER_PAY_OFF_BALANCE_REQUEST', 'LOAN_TAKEOVER_OFFER_REQUEST',
        'LOAN_TAKEOVER_APPROVAL_NOTIFICATION', 'TAKEOVER_DISBURSEMENT_NOTIFICATION',
        'TAKEOVER_PAYMENT_NOTIFICATION', 'PAYMENT_ACKNOWLEDGMENT_NOTIFICATION',
        // Repayments
        'FSP_REPAYMENT_REQUEST', 'REPAYMENT_OFF_BALANCE_REQUEST_TO_FSP',
        'FULL_LOAN_REPAYMENT_REQUEST', 'FULL_LOAN_REPAYMENT_NOTIFICATION',
        'PARTIAL_LOAN_REPAYMENT_REQUEST', 'PARTIAL_LOAN_REPAYMENT_NOTIFICATION',
        'FSP_MONTHLY_DEDUCTIONS', 'LOAN_LIQUIDATION_NOTIFICATION',
        // Status
        'LOAN_STATUS_REQUEST',
        // Defaults
        'DEFAULTER_DETAILS_TO_EMPLOYER', 'DEFAULTER_DETAILS_TO_FSP',
        'DEDUCTION_STOP_NOTIFICATION',
        // Account & Branches
        'ACCOUNT_VALIDATION', 'FSP_BRANCHES'
    ];
    
    $scope.directionOptions = ['INBOUND', 'OUTBOUND'];
    $scope.statusOptions = ['SUCCESS', 'FAILED', 'PENDING', 'RETRY'];
    
    // ==================== TAB MANAGEMENT ====================
    
    $scope.$watch('activeTab', function(newVal, oldVal) {
        if (newVal !== oldVal) {
            webStorage.add('ess.activeTab', newVal);
            if (newVal === 'logs') {
                $scope.loadESSLogs();
                $scope.loadStats();
            } else if (newVal === 'loans') {
                $scope.loadActiveLoans();
            }
        }
    });
    
    // ==================== LOGS SECTION FUNCTIONS ====================
    
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
        
        $http.get($scope.endpoint + '/api/ess/logs', { params: params })
            .then(function(response) {
                var data = response.data;
                $scope.essLogs = data.data || data || [];
                $scope.totalItems = data.total || $scope.essLogs.length;
                $scope.loading = false;
                $scope.allSelected = false;
                
                // Initialize selected flag
                angular.forEach($scope.essLogs, function(log) {
                    log.selected = false;
                });
            })
            .catch(function(error) {
                console.error('Error loading ESS logs:', error);
                $scope.showError('Failed to load ESS logs: ' + (error.data || error.message));
                $scope.loading = false;
            });
    };
    
    $scope.loadStats = function() {
        $http.get($scope.endpoint + '/api/ess/stats')
            .then(function(response) {
                $scope.stats = response.data;
            })
            .catch(function(error) {
                console.error('Error loading stats:', error);
            });
    };
    
    $scope.applyFilters = function() {
        $scope.currentPage = 1;
        $scope.loadESSLogs();
    };
    
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
    
    $scope.pageChanged = function() {
        $scope.loadESSLogs();
    };
    
    $scope.selectAll = function() {
        angular.forEach($scope.essLogs, function(log) {
            log.selected = $scope.allSelected;
        });
    };
    
    $scope.anySelected = function() {
        return $scope.essLogs.some(function(log) { return log.selected; });
    };
    
    $scope.bulkDelete = function() {
        var selected = $scope.essLogs.filter(function(log) { return log.selected; });
        if (selected.length === 0) {
            $scope.showError('Please select at least one log to delete');
            return;
        }
        
        if (confirm('Are you sure you want to delete ' + selected.length + ' log(s)?')) {
            var ids = selected.map(function(log) { return log.id; });
            $http.post($scope.endpoint + '/api/ess/logs/bulk-delete', { ids: ids })
                .then(function(response) {
                    if (response.data.success) {
                        $scope.showSuccess('Logs deleted successfully');
                        $scope.loadESSLogs();
                        $scope.loadStats();
                    }
                })
                .catch(function(error) {
                    console.error('Error bulk deleting logs:', error);
                    $scope.showError('Failed to delete logs');
                });
        }
    };
    
    $scope.deleteLog = function(log) {
        if (confirm('Are you sure you want to delete this log?')) {
            $http.delete($scope.endpoint + '/api/ess/logs/' + log.id)
                .then(function(response) {
                    if (response.data.success) {
                        $scope.showSuccess('Log deleted successfully');
                        $scope.loadESSLogs();
                        $scope.loadStats();
                    }
                })
                .catch(function(error) {
                    console.error('Error deleting log:', error);
                    $scope.showError('Failed to delete log');
                });
        }
    };
    
    $scope.resendToESS = function(log) {
        if (!log || !log.id) return;
        
        $scope.resendingId = log.id;
        
        $http.post($scope.endpoint + '/api/ess/logs/' + log.id + '/resend')
            .then(function(response) {
                if (response.data.success) {
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
    
    $scope.viewDetails = function(log) {
        $scope.selectedLog = angular.copy(log);
        
        // Format payload for display
        if ($scope.selectedLog.request_payload) {
            try {
                var requestData = angular.isString($scope.selectedLog.request_payload) 
                    ? JSON.parse($scope.selectedLog.request_payload) 
                    : $scope.selectedLog.request_payload;
                $scope.selectedLog.formattedRequest = JSON.stringify(requestData, null, 2);
            } catch(e) {
                $scope.selectedLog.formattedRequest = $scope.selectedLog.request_payload;
            }
        }
        
        if ($scope.selectedLog.response_payload) {
            try {
                var responseData = angular.isString($scope.selectedLog.response_payload) 
                    ? JSON.parse($scope.selectedLog.response_payload) 
                    : $scope.selectedLog.response_payload;
                $scope.selectedLog.formattedResponse = JSON.stringify(responseData, null, 2);
            } catch(e) {
                $scope.selectedLog.formattedResponse = $scope.selectedLog.response_payload;
            }
        }
        
        $('#essDetailsModal')//.modal('show');
    };
    
    $scope.exportToCSV = function() {
        var params = {
            search: $scope.searchText,
            messageType: $scope.selectedMessageType,
            direction: $scope.selectedDirection,
            status: $scope.selectedStatus,
            format: 'csv'
        };
        
        if ($scope.dateFrom) {
            params.dateFrom = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.dateTo = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        $window.location.href = $scope.endpoint + '/api/ess/export?' + $.param(params);
    };
    
    // ==================== LOANS SECTION FUNCTIONS ====================
    
    $scope.loadActiveLoans = function() {
        $scope.loansLoading = true;
        
        $http.get($scope.endpoint + '/api/ess/loans/active')
            .then(function(response) {
                $scope.allLoans = response.data || [];
                $scope.filterLoans();
                $scope.calculateLoanStats();
                $scope.loansLoading = false;
            })
            .catch(function(error) {
                console.error('Error loading active loans:', error);
                // Load sample data for demo if API fails
                $scope.loadSampleLoans();
                $scope.loansLoading = false;
            });
    };
    
    $scope.loadSampleLoans = function() {
        // Sample data for testing - remove in production
        $scope.allLoans = [
            {
                id: 1001,
                loanNumber: 'LN-2024-001',
                applicationNumber: 'APP-001',
                clientName: 'John Doe',
                clientId: 'EMP001',
                productCode: 'P001',
                productName: 'Personal Loan',
                principal: 1000000,
                outstandingBalance: 750000,
                status: 'ACTIVE',
                disbursementDate: '2024-01-15',
                maturityDate: '2025-01-15',
                interestRate: 12,
                nextPaymentDate: '2024-03-15',
                nextPaymentAmount: 83333
            },
            {
                id: 1002,
                loanNumber: 'LN-2024-002',
                applicationNumber: 'APP-002',
                clientName: 'Jane Smith',
                clientId: 'EMP002',
                productCode: 'P002',
                productName: 'Emergency Loan',
                principal: 500000,
                outstandingBalance: 500000,
                status: 'ACTIVE',
                disbursementDate: '2024-02-01',
                maturityDate: '2024-08-01',
                interestRate: 10,
                nextPaymentDate: '2024-03-01',
                nextPaymentAmount: 41667
            },
            {
                id: 1003,
                loanNumber: 'LN-2023-089',
                applicationNumber: 'APP-089',
                clientName: 'Robert Johnson',
                clientId: 'EMP089',
                productCode: 'P001',
                productName: 'Personal Loan',
                principal: 2000000,
                outstandingBalance: 350000,
                status: 'OVERDUE',
                disbursementDate: '2023-06-10',
                maturityDate: '2024-02-10',
                interestRate: 12,
                nextPaymentDate: '2024-01-10',
                nextPaymentAmount: 166667
            }
        ];
        $scope.filterLoans();
        $scope.calculateLoanStats();
    };
    
    $scope.filterLoans = function() {
        $scope.filteredLoans = angular.copy($scope.allLoans);
        
        // Apply search filter
        if ($scope.loanSearchText) {
            var search = $scope.loanSearchText.toLowerCase();
            $scope.filteredLoans = $scope.filteredLoans.filter(function(loan) {
                return (loan.loanNumber && loan.loanNumber.toLowerCase().indexOf(search) !== -1) ||
                       (loan.clientName && loan.clientName.toLowerCase().indexOf(search) !== -1) ||
                       (loan.applicationNumber && loan.applicationNumber.toLowerCase().indexOf(search) !== -1) ||
                       (loan.clientId && loan.clientId.toLowerCase().indexOf(search) !== -1);
            });
        }
        
        // Apply status filter
        if ($scope.loanStatusFilter) {
            $scope.filteredLoans = $scope.filteredLoans.filter(function(loan) {
                return loan.status === $scope.loanStatusFilter;
            });
        }
        
        // Apply product filter
        if ($scope.productFilter) {
            $scope.filteredLoans = $scope.filteredLoans.filter(function(loan) {
                return loan.productCode === $scope.productFilter;
            });
        }
    };
    
    $scope.resetLoanFilters = function() {
        $scope.loanSearchText = '';
        $scope.loanStatusFilter = '';
        $scope.productFilter = '';
        $scope.filterLoans();
    };
    
    $scope.refreshLoans = function() {
        $scope.loadActiveLoans();
    };
    
    $scope.calculateLoanStats = function() {
        $scope.loanStats.total = $scope.allLoans.length;
        $scope.loanStats.active = $scope.allLoans.filter(function(l) { return l.status === 'ACTIVE'; }).length;
        $scope.loanStats.overdue = $scope.allLoans.filter(function(l) { return l.status === 'OVERDUE'; }).length;
        $scope.loanStats.totalOutstanding = $scope.allLoans.reduce(function(sum, l) { 
            return sum + (l.outstandingBalance || 0); 
        }, 0);
    };
    
    $scope.loadLoanProducts = function() {
        $http.get($scope.endpoint + '/api/ess/products')
            .then(function(response) {
                $scope.loanProducts = response.data || [];
            })
            .catch(function(error) {
                console.error('Error loading products:', error);
                // Sample products
                $scope.loanProducts = [
                    { code: 'P001', name: 'Personal Loan' },
                    { code: 'P002', name: 'Emergency Loan' },
                    { code: 'P003', name: 'Business Loan' },
                    { code: 'P004', name: 'Education Loan' }
                ];
            });
    };
    
    // ==================== LOAN ACTION FUNCTIONS ====================
    
    $scope.viewLoanDetails = function(loan) {
        $scope.selectedLoan = loan;
        $scope.loanDetailsLoading = true;
        $scope.loanDetails = null;
        
        $http.get($scope.endpoint + '/api/ess/loans/' + loan.id + '/details')
            .then(function(response) {
                $scope.loanDetails = response.data;
                $scope.loanDetailsLoading = false;
                $('#loanDetailsModal')//.modal('show');
            })
            .catch(function(error) {
                console.error('Error loading loan details:', error);
                // Use cached data
                $scope.loanDetails = loan;
                $scope.loanDetailsLoading = false;
                $('#loanDetailsModal')//.modal('show');
            });
    };
    
    $scope.getLoanBalance = function(loan) {
        $http.get($scope.endpoint + '/api/ess/loans/' + loan.id + '/balance')
            .then(function(response) {
                var balance = response.data;
                alert('Loan #' + loan.loanNumber + '\n' +
                      'Outstanding Balance: ' + $filter('number')(balance.outstandingBalance, 2) + '\n' +
                      'Principal Balance: ' + $filter('number')(balance.principalBalance, 2) + '\n' +
                      'Next Payment: ' + $filter('number')(balance.nextPaymentAmount, 2) + ' due ' + 
                      $filter('date')(balance.nextPaymentDate, 'yyyy-MM-dd'));
            })
            .catch(function(error) {
                alert('Outstanding Balance: ' + $filter('number')(loan.outstandingBalance, 2));
            });
    };
    
    $scope.makeRepayment = function(loan) {
        $scope.repaymentLoan = loan;
        $scope.repaymentAmount = loan.nextPaymentAmount || Math.round(loan.outstandingBalance / 12);
        $scope.repaymentDate = new Date();
        $scope.paymentMethod = 'SALARY_DEDUCTION';
        $scope.repaymentNotes = '';
        $('#repaymentModal')//.modal('show');
    };
    
    $scope.submitRepayment = function() {
        if (!$scope.repaymentAmount || $scope.repaymentAmount <= 0) {
            $scope.showError('Please enter a valid payment amount');
            return;
        }
        
        $scope.repaymentSubmitting = true;
        
        var repaymentData = {
            loanId: $scope.repaymentLoan.id,
            loanNumber: $scope.repaymentLoan.loanNumber,
            amount: $scope.repaymentAmount,
            paymentDate: $filter('date')($scope.repaymentDate, 'yyyy-MM-dd'),
            paymentMethod: $scope.paymentMethod,
            notes: $scope.repaymentNotes,
            clientId: $scope.repaymentLoan.clientId,
            clientName: $scope.repaymentLoan.clientName
        };
        
        $http.post($scope.endpoint + '/api/ess/loans/repayment', repaymentData)
            .then(function(response) {
                if (response.data.success) {
                    $scope.showSuccess('Repayment of ' + $filter('number')($scope.repaymentAmount, 2) + ' processed successfully');
                    $('#repaymentModal')//.modal('hide');
                    $scope.loadActiveLoans();
                } else {
                    $scope.showError('Repayment failed: ' + (response.data.message || 'Unknown error'));
                }
                $scope.repaymentSubmitting = false;
            })
            .catch(function(error) {
                console.error('Repayment error:', error);
                $scope.showError('Error processing repayment');
                $scope.repaymentSubmitting = false;
            });
    };
    
    $scope.restructureLoan = function(loan) {
        $scope.restructureLoan = loan;
        $scope.newTenure = null;
        $scope.newInstallmentAmount = null;
        $scope.restructureReason = '';
        $('#restructureModal')//.modal('show');
    };
    
    $scope.submitRestructure = function() {
        if (!$scope.newTenure || $scope.newTenure <= 0) {
            $scope.showError('Please enter a valid tenure');
            return;
        }
        if (!$scope.restructureReason) {
            $scope.showError('Please provide a reason for restructure');
            return;
        }
        
        $scope.restructureSubmitting = true;
        
        var restructureData = {
            loanId: $scope.restructureLoan.id,
            loanNumber: $scope.restructureLoan.loanNumber,
            applicationNumber: $scope.restructureLoan.applicationNumber,
            newTenure: $scope.newTenure,
            newInstallmentAmount: $scope.newInstallmentAmount,
            reason: $scope.restructureReason,
            clientId: $scope.restructureLoan.clientId,
            clientName: $scope.restructureLoan.clientName
        };
        
        $http.post($scope.endpoint + '/api/ess/loans/restructure', restructureData)
            .then(function(response) {
                if (response.data.success) {
                    $scope.showSuccess('Restructure request submitted successfully');
                    $('#restructureModal')//.modal('hide');
                    $scope.loadActiveLoans();
                } else {
                    $scope.showError('Restructure failed: ' + (response.data.message || 'Unknown error'));
                }
                $scope.restructureSubmitting = false;
            })
            .catch(function(error) {
                console.error('Restructure error:', error);
                $scope.showError('Error submitting restructure request');
                $scope.restructureSubmitting = false;
            });
    };
    
    $scope.processTopUp = function(loan) {
        $scope.topupLoan = loan;
        $scope.topupAmount = null;
        $scope.topupProductCode = loan.productCode;
        $scope.settlementAmount = null;
        $('#topupModal')//.modal('show');
    };
    
    $scope.submitTopup = function() {
        if (!$scope.topupAmount || $scope.topupAmount <= 0) {
            $scope.showError('Please enter a valid top-up amount');
            return;
        }
        
        $scope.topupSubmitting = true;
        
        var topupData = {
            existingLoanId: $scope.topupLoan.id,
            existingLoanNumber: $scope.topupLoan.loanNumber,
            requestedAmount: $scope.topupAmount,
            productCode: $scope.topupProductCode,
            settlementAmount: $scope.settlementAmount,
            clientId: $scope.topupLoan.clientId,
            clientName: $scope.topupLoan.clientName,
            applicationNumber: 'TOPUP_' + Date.now()
        };
        
        $http.post($scope.endpoint + '/api/ess/loans/topup', topupData)
            .then(function(response) {
                if (response.data.success) {
                    $scope.showSuccess('Top-up request submitted successfully. New loan reference: ' + (response.data.loanNumber || 'pending'));
                    $('#topupModal')//.modal('hide');
                    $scope.loadActiveLoans();
                } else {
                    $scope.showError('Top-up failed: ' + (response.data.message || 'Unknown error'));
                }
                $scope.topupSubmitting = false;
            })
            .catch(function(error) {
                console.error('Top-up error:', error);
                $scope.showError('Error submitting top-up request');
                $scope.topupSubmitting = false;
            });
    };
    
    $scope.initiateTakeover = function(loan) {
        if (confirm('Initiate takeover for loan ' + loan.loanNumber + '?\n\n' +
                    'This will request a payoff balance from the current FSP and create a new loan.')) {
            
            var takeoverData = {
                loanId: loan.id,
                loanNumber: loan.loanNumber,
                clientId: loan.clientId,
                clientName: loan.clientName,
                applicationNumber: 'TAKEOVER_' + Date.now()
            };
            
            $http.post($scope.endpoint + '/api/ess/loans/takeover', takeoverData)
                .then(function(response) {
                    if (response.data.success) {
                        $scope.showSuccess('Takeover initiated successfully. Reference: ' + (response.data.referenceNumber || 'pending'));
                        $scope.loadActiveLoans();
                    } else {
                        $scope.showError('Takeover failed: ' + (response.data.message || 'Unknown error'));
                    }
                })
                .catch(function(error) {
                    console.error('Takeover error:', error);
                    $scope.showError('Error initiating takeover');
                });
        }
    };
    
    $scope.cancelLoan = function(loan) {
        if (confirm('Are you sure you want to cancel loan ' + loan.loanNumber + '?\n\nThis action cannot be undone.')) {
            
            $http.post($scope.endpoint + '/api/ess/loans/' + loan.id + '/cancel')
                .then(function(response) {
                    if (response.data.success) {
                        $scope.showSuccess('Loan cancelled successfully');
                        $scope.loadActiveLoans();
                    } else {
                        $scope.showError('Cancellation failed: ' + (response.data.message || 'Unknown error'));
                    }
                })
                .catch(function(error) {
                    console.error('Cancel error:', error);
                    $scope.showError('Error cancelling loan');
                });
        }
    };
    
    $scope.viewTransactionHistory = function(loan) {
        $http.get($scope.endpoint + '/api/ess/loans/' + loan.id + '/transactions')
            .then(function(response) {
                var transactions = response.data || [];
                var message = 'Transaction History for Loan #' + loan.loanNumber + '\n\n';
                transactions.forEach(function(t) {
                    message += $filter('date')(t.date, 'yyyy-MM-dd') + ' - ' + t.type + ': ' + $filter('number')(t.amount, 2) + '\n';
                });
                if (transactions.length === 0) message += 'No transactions found';
                alert(message);
            })
            .catch(function(error) {
                alert('No transaction history available');
            });
    };
    
    $scope.downloadLoanStatement = function(loan) {
        var params = {
            loanId: loan.id,
            format: 'pdf'
        };
        $window.open($scope.endpoint + '/api/ess/loans/' + loan.id + '/statement?' + $.param(params), '_blank');
    };
    
    // ==================== HELPER FUNCTIONS ====================
    
    $scope.getStatusClass = function(status) {
        switch(status) {
            case 'SUCCESS': return 'label-success';
            case 'FAILED': return 'label-danger';
            case 'PENDING': return 'label-warning';
            case 'RETRY': return 'label-info';
            default: return 'label-default';
        }
    };
    
    $scope.getDirectionClass = function(direction) {
        return direction === 'INBOUND' ? 'label-primary' : 'label-success';
    };
    
    $scope.showSuccess = function(message) {
        $scope.successMessage = message;
        $timeout(function() {
            $scope.successMessage = null;
        }, 3000);
    };
    
    $scope.showError = function(message) {
        $scope.errorMessage = message;
        $timeout(function() {
            $scope.errorMessage = null;
        }, 5000);
    };
    
    $scope.refresh = function() {
        if ($scope.activeTab === 'logs') {
            $scope.loadESSLogs();
            $scope.loadStats();
        } else {
            $scope.loadActiveLoans();
        }
    };
    
    // ==================== INITIALIZATION ====================
    
    $scope.init = function() {
        $scope.loadESSLogs();
        $scope.loadStats();
        $scope.loadLoanProducts();
        
        // Initialize chosen selects
        $timeout(function() {
            $('.chosen-select').chosen({width: '100%'});
        }, 500);
    };
    
    $scope.init();
    
    // Clean up modals on scope destroy
    $scope.$on('$destroy', function() {
        $('.modal')//.modal('hide');
    });
    
}]);

