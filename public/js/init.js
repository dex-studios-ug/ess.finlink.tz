mifosX.ng.application.run(['$compile', '$rootScope', '$timeout','$http','settings',
    function($compile, $rootScope, $timeout,$http,settings) {
        $rootScope.settings=settings;
        window.settings = settings;
        settings.ess_notif=1;
        settings.sms_notif=0;
        settings.crdb_notif=0;
        settings.atm_notif=0;
        
        // Add SMS menu item to navigation
        function buildSmsMenu() {
            const menuTemplate = `
           <style>
.pulse-ring {
  position: absolute;
  top: 20px;
  background: red;
  right: 20px;
    width: 4px;
    height: 4px;
    border: 2px solid red;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
    opacity: 0.75;
}
@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 1;
    }
    70% {
    transform: scale(2.5);
    opacity: 0;
  }
  100% {
    transform: scale(0.8);
    opacity: 1;
    }
}

         </style>
           
          <li class="dropdown" uib-dropdown>
 
  <!-- Toggle button -->
  <a href="" class="dropdown-toggle" uib-dropdown-toggle>
  
    <i class="fa fa-cogs"></i>
    Integrations <span class="caret"></span>
    
  </a>
  <div style="
	border-radius: 50%;
	width: 20px;
	height: 20px;
	padding: 3px;
	background: #16a05f;
	border: 2px solid #fff;
	text-align: center;
	color: #fff;
	font: 10px Arial, sans-serif;
	position: absolute;
	top: 3px;
	right: 20px;
	font-weight: bold;
"
    ng-show="settings.sms_notif > 0 || settings.ess_notif > 0 || settings.crdb_notif > 0 || settings.atm_notif > 0">{{
    settings.sms_notif + settings.ess_notif + settings.crdb_notif + settings.atm_notif }}</div>

  <!-- Dropdown menu -->
  <ul class="dropdown-menu" uib-dropdown-menu role="menu">

    <li has-permission="ALL_FUNCTIONS">
      <a href="#/viewsmslog">
        <i class="fa fa-paper-plane"></i> SMS
        <span class="badge pull-right " style="background: blue ;" >{{settings.sms_notif}}</span>
      </a>
    </li>

    <li has-permission="ALL_FUNCTIONS">
      <a href="#/viewesslog">
        <i class="fa fa-user"></i> ESS <span class="badge pull-right " style="background: green ;" >{{settings.ess_notif}}</span>
      </a>
    </li>

    <li has-permission="ALL_FUNCTIONS">
      <a href="#/viewcrdblog">
        <i class="fa fa-bank"></i> CRDB <span class="badge pull-right " style="background: orange ;" >{{settings.crdb_notif}}</span>
      </a>
    </li>

    <li has-permission="ALL_FUNCTIONS">
      <a href="#/viewatmlog">
        <i class="fa fa-credit-card"></i> ATM <span class="badge pull-right " style="background: cyan ;" >{{settings.atm_notif}}</span>
      </a>
    </li>

  </ul>

</li>   
            <li>
                    <a href="">
                    <i class="fa fa-volume-up"></i><span class=""> {{settings.sms_volume || '-'}} sms</span>
                    </a>
                </li>
                 `;
            const menuElement = $compile(menuTemplate)($rootScope);
            angular.element('#main-menu-left').append(menuElement);
            $('#bs-example-navbar-collapse-1 input#search').css('width','auto');
           // $('#mifos-reskin-body-view').addClass('card').css('min-height','70vh');
        }

        // Wait for navigation to be ready
        function initializeNavigation() {
            const mainMenu = document.querySelector('#main-menu-left');
            
            if (!mainMenu) {
                $timeout(initializeNavigation, 200);
                return;
            }
            
            buildSmsMenu();
        }

        // Start initialization
        initializeNavigation();
    }
])
.config(function($sceDelegateProvider) {
  $sceDelegateProvider.resourceUrlWhitelist([
    // Allow same origin resource loads.
    'self',
    // Allow loading from a specific external secure/insecure domain
    'http://localhost:3000/**'
  ]);
});



