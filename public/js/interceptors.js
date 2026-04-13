mifosX.ng.application.factory('smsinterceptor', ['$q',  '$injector','$rootScope','$filter','settings',
    function($q, $injector,$rootScope,$filter,settings) {
        const CACHE_LIMIT = 30;
        const messageCache = new Map();
        
        const COMMANDS = {
            WITHDRAW: 'withdraw',
            DEPOSIT: 'deposit',
            ACTIVATE: 'activat',
            APPROVE: 'approv',
            REJECT: 'reject',
            DISBURSE: 'disburs',
            //UNDISBURSE: 'undisburs', 
            //WRITEOFF: 'writeoff',
           //REACTIVATE: 'reactivat',
            REPAY: 'repay',
            CLOSE: 'clos'
        };
        const qualifiers=["/loans/","/clients/","/savingsaccounts/","/shareaccounts/","/accounts/","/accounts/share/"]

        function extractTransactionDetails(data) {
            const details = {
                amount: null,
                date: null
            };

            // Check common transaction paths
            if (data?.changes) {
                details.amount = data.changes.transactionAmount;
                details.date = data.changes.transactionDate;
            }

            if (!details.amount) {
                details.amount = data?.transactionAmount || data?.amount || data?.amt;
            }

            // Deep search for date/amount fields
            function searchObject(obj, depth = 0) {
                if (depth > 3) return; // Prevent deep recursion

                for (const [key, value] of Object.entries(obj)) {
                    const keyLower = key.toLowerCase();
                    
                    if (!details.date && keyLower.includes('date') && value) {
                        details.date = Date.parse(value)? value : null;
                    }
                    if (!details.amount && keyLower.includes('amount') && value) {
                        details.amount = value;
                    }
                    if (typeof value === 'object' && value) {
                        searchObject(value, depth + 1);
                    }
                }
            }

            if (data && typeof data === 'object') {
                searchObject(data);
            }
        //console.log(details)
            return details;
        }

        async function getClientDetails(resourceFactory, clientId) {
            try {
                return await $q((resolve, reject) => {
                    resourceFactory.clientResource.get({ clientId }, 
                        data => resolve(data),
                        error => reject(error)
                    );
                });
            } catch (error) {
                console.error('Failed to fetch client details:', error);
                return null;
            }
        }

        async function sendNotification(config, data, transactionDetails) {

        const resourceFactory = $injector.get('ResourceFactory');
            //console.log(data)
            let clientId =null;

            // Determine client ID from various sources
           
                let id=null
                const url=config.url
                if(id=(url.match(/\/\d+\b/)[0]||location.href.match(/\/\d+\b/)[0])){
                              id=id.slice(1)

                            if(url.includes("/savingsaccounts/")){
                                config.savingAccountId=data.savingsId||id;

                            }else if(url.includes("/loans/")){
                                config.loanId=data.loanId||id;
                            }else if(url.includes("/clients/")){
                                clientId=data.clientId||id;
                            }
                        }

                       // alert(id)
                        
                if(!clientId)if (config.loanId) {
                    const loanData = await $q((resolve) => {
                        resourceFactory.loanResource.get({ loanId: config.loanId }, resolve);
                    });
                    clientId = loanData?.clientId;
                } else if (config.savingAccountId) {
                    const savingsData = await $q((resolve) => {
                        resourceFactory.savingsResource.get({ accountId: config.savingAccountId }, resolve);
                    });
                    clientId = savingsData?.clientId;
                } else {
                    clientId =data.clientId || data.id || data.resourceId||config.id ;
                }
            
            if(data.clientId){
                if(clientId&&clientId!=data.clientId){
                    console.error("Incorrect parsed clientId as data.clientId!=clientId")
                }
                clientId=data.clientId;
            }
            if (!clientId) {
                console.error('Could not determine client ID');
                return;
            }

            const client = await getClientDetails(resourceFactory, clientId);
            if (!client) return;

            // Extract mobile number
            let mobileNo = client.mobileNo;
            if (!mobileNo && client.lastname) {
                const phoneMatch = client.lastname.match(/\+?\d{9,}/);
                mobileNo = phoneMatch?.[0];
            }

            if (!mobileNo) {
                //alert(`No mobile number found for client ${clientId}`);
                //return;
            }
            if(transactionDetails.date&&Array.isArray(transactionDetails.date))
                transactionDetails.date=transactionDetails.date.join("-")
                            const accountType = config.loanId ? 'loan' : config.savingAccountId ? 'saving' : '';
                              let companyname= document.title ||"FINANCIAL";
                              const name= client.displayName || client.firstname || 'Client'
                              const accno=config.loanId ? config.loanId  : config.savingAccountId ? config.savingAccountId : clientId;
                              const amt=transactionDetails.amount||' - '
                              const date=transactionDetails .date||new Date().toISOString().split('T')[0]
                              let msg=null
                              console.log(config)
                              if(data.feature){
                                msg=data.feature.template || data.feature.defaultTemplate
                              if(msg)  {msg=msg.replace("{{clientName}}",name)
                                .replace("{{accountNo}}",accno)
                                .replace("{{transactionAmount}}",$filter('number')(amt||0) + " TZS")
                                .replace("{{transactionDate}}",date)
                                .replace("{{companyName}}",companyname )
                                .replace("{{accountType}}",accountType||'')
                              console .log([data.feature.key ,msg])
                            }
                              }


            const message = msg || `Dear ${client.displayName  || client.firstname || 'Client'}, Your ${accountType} acc/no${ accno || clientId} has been ${config.cmd}ed` +
                          ` on ${transactionDetails.date || new Date().toISOString().split('T')[0]}.` +
                          `${transactionDetails.amount ? ' Amount: ' + transactionDetails.amount : ''}`;
            const endpoint="/dexstudios/sms"
            try {
                 if(settings.sms_volume<1){ 
                    window.show_alert("Could not send SMS.\n SMS Bundle depleted ,Please Recharge!")
                 return;}
            
                const http=$injector.get("$http");
                 if(settings?.sms_enabled){
                   // http.get(endpoint+ "?phone="+mobileNo+"&message="+message+"&client="+data.clientId).then(resp=>show_alert(data.feature.key + ' sms queued for '+mobileNo));
                   show_alert(data.feature.key + ' sms queued for '+mobileNo);
                    settings.sms_volume--;
                }
                  
                 else{
                    show_alert("sms disabled")}
            } catch (error) {
                console.error('Failed to send SMS:', error);
                show_alert("Failed to send sms to "+mobileNo)
            }
        }

     function isFeatureEnabled(command) {
       var  ft= settings?.features.filter(e=>e.key.toLowerCase().includes(command))[0]
       //alert(JSON.stringify(ft))
        return ft
        }

        return {
            request: function(config) {
            
                const isJsonRequest = config.headers?.['Content-Type']?.includes('application/json');
                if (!isJsonRequest) return config;
                
                if(!config)return config

                const url = config.url;
                const command = config.params?.command;

                if (!command || 
                    command.includes('un') || 
                    !url ||
                    url.includes('template') || 
                    config.method !== 'POST') {
                    return config;
                }

                if (url&&url.includes('fineract-provider/api/v1') && 
                    (url.includes('/client') || url.includes('/loan') || url.includes('/saving'))) {
                    if (messageCache.size >= CACHE_LIMIT) {
                        const firstKey = messageCache.keys().next().value;
                        messageCache.delete(firstKey);
                    }
                    messageCache.set(url, config.data);
                }

                return config;
            },

            response: async function(response) {
           
                const isJsonResponse = response.headers()['content-type']?.includes('application/json');
                if (!isJsonResponse) return response;

                const config = response.config;
                if(!config  )return response;

                const command = config?.params?.command;
                const url = config?.url;
                //console.log(response)

                if (!config||!command || 
                    command.includes('undo') || 
                    !url || 
                    url.includes('template') || 
                    config.method !== 'POST') {
                    return response;
                }
                const commandType = Object.values(COMMANDS).find(c => command.includes(c));
                if (!commandType) return response;

                /////filter on account resource urls only
                const urlfiltered=qualifiers.filter(f=>config.url.includes(f)).length
                if(!urlfiltered)return response

                const featureEnabled = isFeatureEnabled(commandType);
                if (!featureEnabled) return response;
                //alert(command)
                config.cmd=commandType

                const data = response.data;
                if(data)data.feature=featureEnabled
                const cachedData = messageCache.get(url);
                messageCache.delete(url);

                const transactionDetails = extractTransactionDetails({
                    ...data,
                    ...(cachedData || {})
                });

                sendNotification(config, data, transactionDetails);
                return response;
            },

            responseError: function(response) {
                return $q.reject(response);
            }
        };
    }
])
.config(['$httpProvider', function($httpProvider) {
    $httpProvider.interceptors.push('smsinterceptor');
}]);
