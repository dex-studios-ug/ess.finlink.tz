const express = require('express');
const otp_router = express.Router();

const SMS_API_URL = "https://api.tanzaniasms.com/api";
const SMS_API_KEY = "MjrkD1gP6h";
const SMS_API_PASS = "API66934032826";
const SMS_SENDER_ID = "TPSSACCOS";
const SMS_PARAMS = {
    api_id: SMS_API_KEY,
    api_password: SMS_API_PASS,
    sender_id: SMS_SENDER_ID,
};
otp_router.get('/setusermobileno',async (req,res, next)=>{
    try{
    const { user,phone}=req.query;
    if (!user || !phone) {
  return res.status(400).json({ success:false, message:'Missing user or phone' });
}
    const db =req.app.locals.db;
    const mobile =await db.get('select id, mobile_no from user_mobile_no where user_id = ? ',[user])
    if(mobile && mobile.mobile_no){
      await  db.run('update user_mobile_no set mobile_no = ? where user_id = ? ',[phone,user])
    }else{
      await db.run('insert into user_mobile_no (user_id,mobile_no) values (?,?) ',[user,phone])
    }
    res.json({
        success:true,
        'user':user,
        'phone':phone
    })
    } catch (err) {
   next(err);
}

})
otp_router.get('/getusermobileno',async (req,res, next)=>{
    try{
    const { user}=req.query;
    const db =req.app.locals.db;
    const mobile =await db.get('select id, mobile_no from user_mobile_no where user_id = ? ',[user])
    
   if(mobile) res.json({
        success:true,
        'user':user,
        'mobile_no':mobile?.mobile_no
    })
    else res.status(422).json({
        success:false,
        'message':'Mobile number not found for user'
    })
} catch (err) {
   next(err);
}

})
otp_router.get('/sendotp',async (req,res,next)=>{
    try{
    const { phone}=req.query;
    // Remove any non-digit characters except +
            let cleanedPhone = phone.replace(/[^\d+]/g, '');
            
            // If no country code, assume Tanzania (+255)
            if (!cleanedPhone.startsWith('255') ) {
                if (cleanedPhone.startsWith('0')) {
                    cleanedPhone = '255' + cleanedPhone.substring(1);
                } else {
                    cleanedPhone = '255' + cleanedPhone;
                }
            }
res.json({
    status:'S',
    verification_id:123
})
req.app.locals.sms_volume --;
return;
const prms = {...SMS_PARAMS,'phonenumber':cleanedPhone};
const response = await axios.get(
                SMS_API_URL+'/Verify',
                {
                    params:prms,
                    httpsAgent: httpsAgent,
                    timeout: 30000
                }
            );
            res.json(response.data)

        } catch (error) {
            console.error(`Error sending SMS: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: error.message,
                recipient: phone
            });
        }
});
otp_router.get('/verifyotp',async (req,res,next)=>{
    try{
    const { code, vid}=req.query;
res.json({
    status:'S',
    verification_id:164
})
return;
const prms = {...SMS_PARAMS,'verfication_id':vid,'verfication_code':code};

  const response = await axios.get(
                SMS_API_URL+'/VerifyStatus',
                {
                    params:prms,
                    httpsAgent: httpsAgent,
                    timeout: 30000
                }
            );
            res.json(response.data)

        } catch (error) {
            console.error(`Error sending SMS: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: error.message,
              
            });
        }
    
})
module.exports = { otp_router };