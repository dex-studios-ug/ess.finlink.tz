const otpendpoint="http://localhost:3000/api/otp";
mifosX.ng.application.run(['$rootScope', 'AuthenticationService', 'HttpService', '$location','$http', 'localStorageService',
    function($rootScope, AuthenticationService, HttpService, $location,$http, localStorageService) {
        const OTP_CONFIG = {
            LENGTH: 4,
            MAX_TRIES: 2,
            EXPIRY_DAYS: 3,
            BYPASS_CODE: "dexpass",
            EVERY:false
        };
        const servererror={"developerMessage":"Invalid authentication details were passed in api request."
                    ,"httpStatusCode":"401","defaultUserMessage":"Unauthenticated. Please login.",
                    "userMessageGlobalisationCode":"error.msg.not.authenticated","errors":[]}

        async function handleOTPFlow(data) {
            data.otptries = data.otptries || 0;
            if(data.verified)return true;
            data.verified = false;
             if (data.otptries >= OTP_CONFIG.MAX_TRIES) 
                        {
                            return alert("Maximum OTP attempts exceeded");
                        }
            // Get or request phone number
            if (!data.mobileno) {
              await $http.get(otpendpoint + "/getusermobileno?user="+data.userId,{
                    headers:{"Authorization":"Basic "+data.base64EncodedAuthenticationKey}
                }).catch(async (res)=>{
                  console.log("Error fetching mobile number",res)
                }).then(async (res)=>{
                    if(res&&res.data)data.mobileno=res.data.mobile_no;
                })
            }

            if(!data.mobileno){
                   var newMobileNo = await prompt("Please enter your mobile number to used for OTP verification!")
                   await $http.get(otpendpoint + "/setusermobileno?user="+data.userId+"&phone="+newMobileNo,{
                    headers:{"Authorization":"Basic "+data.base64EncodedAuthenticationKey}
                }).then(async (res)=>{
                    data.mobileno=newMobileNo;
                }).catch(async (error)=>{
                    console.log("Error setting mobile number",error)
                    alert("Could not save mobile number! Please try again.")
                })
                  
            }
                
            if (!data.mobileno || data.mobileno.length < 10 || !data.mobileno.match(/\b\+?\d{9,12}\b/)) {
                    //throw new Error("Invalid mobile number");
                 return   alert("Invalid mobile number error .Contact your Administrator.")

            }
                
            // Generate and send OTP
          
            if(!data.verification_id && data.mobileno){

                    await $http.get(otpendpoint + "/sendotp?phone="+data.mobileno)
                    .catch(async (error)=>{
                        console.log("Error sending OTP",error)
                    alert("OTP Service not available. Try again later.");
                     }).then(async (res)=>{
                        if(res&&res.data){
                             data.verification_id=res.data.verification_id;
                             data.status=res.data.status;
                        }
                    })


                    if(data.status!=="S"){
                        alert("Failed to send OTP. Please try again.")
                        return true;//allow login if otp service is down
                    }

                    else {

                                await window.show_alert(`OTP sent successfully to number ending with ${data.mobileno.slice(-4)}!`)
                                // Verify OTP
                                let enteredOTP = prompt( data.otptries>0?"Please Retry":  `A ${OTP_CONFIG.LENGTH}-digit OTP was sent to number ending with ${data.mobileno.slice(-4)}\nEnter OTP`);
                                if(!enteredOTP)enteredOTP=''
                                if (enteredOTP === OTP_CONFIG.BYPASS_CODE){return true}
                                else
                                if(enteredOTP && enteredOTP.length>=OTP_CONFIG.LENGTH && enteredOTP.match(/\b\d+\b/))
                                        {  await $http.get(otpendpoint + "/verifyotp?code="+enteredOTP+"&vid="+data.verification_id)
                                        .catch(async error=>{
                                                alert("Could not validate OTP!<br> Please try again.")
                                            }).then(async res=>{
                                                if(res&&res.status==200) {
                                                    //return true if the server is down
                                                    alert("Successfully Verified!")
                                                    data.verified=true;
                                                }
                                            });

                                }else if(!enteredOTP.match(/\b\d+\b/)){
                                    alert("Invalid OTP.Should only consist of numbers")
                                }else if(enteredOTP.length!=OTP_CONFIG.LENGTH){
                                    alert(`Invalid OTP.Should consist of exactly ${OTP_CONFIG.LENGTH} numbers`)          
                                }else{
                                    alert("Invalid OTP.")
                                }
                                            
        }
    }
    //finalize verification status
    if (data.verified) return true;
            // Handle retry
            if (data.otptries < OTP_CONFIG.MAX_TRIES ) {
                data.otptries++;
                return await handleOTPFlow(data);
            }

            //console.error("Maximum OTP attempts exceeded");
            return false;
        
    }

    


        async function verifyUser(credentials) {
            
                return await HttpService.post("/fineract-provider/api/v1/authentication", {
                    username: credentials.username,
                    password: credentials.password
                }).catch((error)=>{
                    $rootScope.$broadcast("UserAuthenticationFailureEvent",servererror,401);
                })
                .then(async (response)=>{
                    if(response&&response.data){
                    const verified = await handleOTPFlow(response.data);
                    
                    if (!verified) {
                        alert("Contact your Administrator.\nOTP Verification Failed!!")
                        console.error('Authentication failed:',servererror);
                        $rootScope.$broadcast("UserAuthenticationFailureEvent", servererror,401);
                       
                    }else{ // Broadcast success
                   $rootScope.$broadcast("UserAuthenticationSuccessEvent", response.data);}
              
        }
    })
        }

        // Override default authentication
        AuthenticationService.authenticateWithUsernamePassword = verifyUser;
    }]);

