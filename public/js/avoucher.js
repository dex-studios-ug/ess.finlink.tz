
const utilendpoint="http://localhost:3000/api/utils";
mifosX.ng.application.run(['$rootScope','$compile','$timeout','$http',function($rootScope,$compile,$timeout,$http){
  
    $rootScope.getVCN= async function fetchReference(){
      var inputs=$('input#referenceNumber,input#receiptNumber,input#voucherNumber,input#checkNumber').not(':hidden');
       if(!inputs.length)return
       var ref = await $http.get(utilendpoint+'/voucher').catch((e)=>{})
       if(ref.status==200){
         inputs.filter((e)=>!e.value).val(ref.data.vcn).trigger('change').trigger('focus')
       //.prop('disabled',true)
       }
     }
  
     $rootScope.clearVCN=function clearReferenceNumber(){
    $('input#referenceNumber,input#receiptNumber,input#voucherNumber,input#checkNumber').val('')
  }
  
  
    $rootScope.buildAttachRef=async function(){ 
  
      var inputs=$('input#referenceNumber,input#receiptNumber,input#voucherNumber,input#checkNumber').not(':hidden');
       if(!inputs.length)return
     
      if($('#DEXVCN').length)return
  
     let template = `
        
        <a id='DEXVCN' class='btn btn-warning pull-right' ng-click="getVCN()">GET VOUCHER NO.</a>
        <a class='btn pull-right' ng-click="clearVCN()">CLEAR VOUCHER</a>
       
      `;
  
      // Compile and append to #main-menu-left
      var compiled = $compile(template)($rootScope);
      //angular.element(document.querySelector('.content-container')).append(compiled);
      var form=$('.content-container .toolbar, .content-container form').first()
      if(form.length)$(compiled).prependTo(form)
     }
   
    $rootScope.$on('$viewContentLoaded',function(){ 
         $timeout( $rootScope.buildAttachRef,250)
      })
  
    $rootScope.$on('$onRouteChangeSuccess',function(){ 
     $timeout( $rootScope.buildAttachRef,250)
      })
  
  
  
  }])