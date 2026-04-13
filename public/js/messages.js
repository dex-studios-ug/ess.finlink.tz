mifosX.ng.application
.controller('SMSViewCtrl', ['$scope', '$http', '$filter', '$uibModal', 
    function($scope, $http, $filter, $uibModal ) {
mifosX.ng.application
    
    // Initialize scope variables
    $scope.smsLogs = [];
    $scope.loading = false;
    $scope.totalItems = 0;
    $scope.currentPage = 1;
    $scope.pageSize = 20;
    $scope.searchText = '';
    $scope.selectedStatus = '';
    $scope.selectedType = '';
    $scope.selectedEntity = '';
    $scope.dateFrom = null;
    $scope.dateTo = null;
    
    // Filter options
    $scope.statusOptions =[]// ['Pending', 'Delivered', 'Failed'];
    $scope.typeOptions =[] // ['TRANSACTION_ALERT', 'OTP', 'LOAN_ALERT', 'SAVINGS_ALERT', 'ACCOUNT_ALERT'];
    $scope.entityOptions = [] //['TRANSACTION', 'ACCOUNT', 'LOAN', 'SAVINGS', 'CLIENT'];
    
    // Load SMS logs
    $scope.loadSMSLogs = function() {
        $scope.loading = true;
        
        var params = {
            page: $scope.currentPage,
            limit: $scope.pageSize,
            search: $scope.searchText,
            status: $scope.selectedStatus,
            type: $scope.selectedType,
            entity: $scope.selectedEntity
        };
        
        if ($scope.dateFrom) {
            params.dateFrom = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.dateTo = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        $http.get(smsendpoint + '/logs', { params: params })
            .then(function(response) {
                $scope.smsLogs = response.data.data || response.data;
                $scope.totalItems = response.data.total || response.data.length;
                $scope.loading = false;
                $scope.statusOptions=[... new Set($scope.smsLogs.map(log=>log.status))]
                $scope.typeOptions=[... new Set($scope.smsLogs.map(log=>log.type))]
                $scope.entityOptions=[... new Set($scope.smsLogs.map(log=>log.entity))]
                
            })
            .catch(function(error) {
                console.error('Error loading SMS logs:', error);
                $scope.errorMessage = 'Failed to load SMS logs';
                $scope.loading = false;
            });
    };
    
    // Resend SMS
    $scope.resendSMS = function(log) {
        if (!log || !log.id) return;
        
        $scope.resendingId = log.id;
        
        $http.post(smsendpoint + '/resend/' + log.id)
            .then(function(response) {
                if (response.data.success) {
                    log.status = 'Pending';
                    log.retry_count = (log.retry_count || 0) + 1;
                    $scope.showSuccess('SMS resent successfully');
                } else {
                    $scope.showError('Failed to resend SMS');
                }
                $scope.resendingId = null;
            })
            .catch(function(error) {
                console.error('Error resending SMS:', error);
                $scope.showError('Error resending SMS');
                $scope.resendingId = null;
            });
    };
    $scope.anySelected = function() {
  return $scope.smsLogs.some(function(l) {
    return l.selected;
  });
};
    $scope.closeDetails = function() {
        if ($scope.instance) {
            $scope.instance.dismiss('close');
            $scope.selectedLog = null;
        }
    };
    // View SMS details
    $scope.viewDetails = function(log) {
        $scope.selectedLog = angular.copy(log);
        $scope.instance =  $uibModal.open({
      template:`<!-- SMS Details Content -->
<div ng-if="selectedLog">

  <!-- Message Information -->
  <div class="panel panel-default">
    <div class="panel-heading"><strong>Message Information</strong></div>
    <div class="panel-body">

      <div class="row">
        <div class="col-xs-3"><strong>ID:</strong></div>
        <div class="col-xs-9">{{selectedLog.id}}</div>
      </div>

      <div class="row">
        <div class="col-xs-3"><strong>Receiver:</strong></div>
        <div class="col-xs-9">{{selectedLog.receiver}}</div>
      </div>

      <div class="row">
        <div class="col-xs-3"><strong>Status:</strong></div>
        <div class="col-xs-9">
          <span class="label {{getStatusClass(selectedLog.status)}}">{{selectedLog.status}}</span>
        </div>
      </div>

      <div class="row">
        <div class="col-xs-3"><strong>Type:</strong></div>
        <div class="col-xs-9">{{selectedLog.type || 'N/A'}}</div>
      </div>

      <div class="row">
        <div class="col-xs-3"><strong>Entity / Action:</strong></div>
        <div class="col-xs-9">{{selectedLog.entity || 'N/A'}} / {{selectedLog.action || 'N/A'}}</div>
      </div>

      <div class="row">
        <div class="col-xs-3"><strong>Client:</strong></div>
        <div class="col-xs-9">
          {{selectedLog.client_name || 'N/A'}}
          <span ng-if="selectedLog.client_id">(ID: {{selectedLog.client_id}})</span>
        </div>
      </div>

      <div class="row">
        <div class="col-xs-3"><strong>Created At:</strong></div>
        <div class="col-xs-9">{{selectedLog.created_at | date:'yyyy-MM-dd HH:mm:ss'}}</div>
      </div>

    </div>
  </div>

  <!-- Message Content -->
  <div class="panel panel-default" style="margin-top: 15px;">
    <div class="panel-heading"><strong>Message Content</strong></div>
    <div class="panel-body" style="background-color: #f8f9fa; border-radius: 5px;">
      {{selectedLog.message}}
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="text-right p-2" style="margin-top: 10px;">
    <button type="button" class="btn btn-default" ng-click="closeDetails()">
      Close
    </button>
    <button type="button" class="btn btn-warning" ng-click="resendSMS(selectedLog)">
      <i class="fa fa-repeat"></i> Resend SMS
    </button>
  </div>

</div>`,
    scope: $scope,
    
    });
  
    };

    
    // Filter SMS logs
    $scope.applyFilters = function() {
        $scope.currentPage = 1;
        $scope.loadSMSLogs();
    };
    
    // Reset filters
    $scope.resetFilters = function() {
        $scope.searchText = '';
        $scope.selectedStatus = '';
        $scope.selectedType = '';
        $scope.selectedEntity = '';
        $scope.dateFrom = null;
        $scope.dateTo = null;
        $scope.currentPage = 1;
        $scope.loadSMSLogs();
    };
    
    // Export to CSV
    $scope.exportToCSV = function() {
        var params = {
            search: $scope.searchText,
            status: $scope.selectedStatus,
            type: $scope.selectedType,
            entity: $scope.selectedEntity
        };
        
        if ($scope.dateFrom) {
            params.dateFrom = $filter('date')($scope.dateFrom, 'yyyy-MM-dd');
        }
        if ($scope.dateTo) {
            params.dateTo = $filter('date')($scope.dateTo, 'yyyy-MM-dd');
        }
        
        window.location.href = smsendpoint + '/export?' + $.param(params);
    };
    
    // Delete SMS log
    $scope.deleteLog = function(log) {
        if (confirm('Are you sure you want to delete this SMS log?')) {
            $http.delete(smsendpoint + '/logs/' + log.id)
                .then(function(response) {
                    if (response.data.success) {
                        $scope.loadSMSLogs();
                        $scope.showSuccess('SMS log deleted successfully');
                    }
                })
                .catch(function(error) {
                    console.error('Error deleting SMS log:', error);
                    $scope.showError('Failed to delete SMS log');
                });
        }
    };
    
    // Bulk delete
    $scope.bulkDelete = function() {
        var selected = $scope.smsLogs.filter(function(log) { return log.selected; });
        if (selected.length === 0) {
            $scope.showError('Please select at least one SMS log to delete');
            return;
        }
        
        if (confirm('Are you sure you want to delete ' + selected.length + ' SMS log(s)?')) {
            var ids = selected.map(function(log) { return log.id; });
            $http.post(smsendpoint + '/logs/bulk-delete', { ids: ids })
                .then(function(response) {
                    if (response.data.success) {
                        $scope.loadSMSLogs();
                        $scope.showSuccess('SMS logs deleted successfully');
                    }
                })
                .catch(function(error) {
                    console.error('Error bulk deleting SMS logs:', error);
                    $scope.showError('Failed to delete SMS logs');
                });
        }
    };
    
    // Select all checkboxes
    $scope.selectAll = function() {
        angular.forEach($scope.smsLogs, function(log) {
            log.selected = $scope.allSelected;
        });
    };
    
    // Watch for select all changes
    $scope.$watch('allSelected', function(newValue) {
        if ($scope.smsLogs) {
            angular.forEach($scope.smsLogs, function(log) {
                log.selected = newValue;
            });
        }
    });
    
    // Get status badge class
    $scope.getStatusClass = function(status) {
        switch(status) {
            case 'Delivered': return 'badge-success';
            case 'Failed': return 'badge-danger';
            case 'Pending': return 'badge-warning';
            default: return 'badge-secondary';
        }
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
        $scope.loadSMSLogs();
    };
    
    // Initial load
    $scope.loadSMSLogs();
}]);