const express = require('express');
const router = express.Router();

// Helper: get DB
const getDB = (req) => req.app.locals.db;

/* =====================================================
   APPROVAL FLOW
===================================================== */
router.get('/',async (req, res) => {
    const db = getDB(req);
    const {loan_id , user_id} = req.query;

    const approvers = (await db.all(`SELECT * FROM LoanApprover where status = 1 ORDER BY rank ASC`) )|| []

     const approvals = (await   db.all(`SELECT * FROM LoanApproval WHERE loan_id = ?`, [loan_id])) || []
        var apl = approvals.map(a=>a.user_id+"_"+a.rank)
     res.json({
        status:approvers.every(a=>apl.includes(a.user_id+"_"+a.rank))?'approved':'processing',
        approvals,
        approvers
     })
   
});
// ✅ Approve Loan
router.get('/approve',async (req, res) => {
    const db =getDB(req)
    const {loan_id , user_id,rank} = req.query;
    const isApproved = await db.all('select * from LoanApproval where user_id = ? and loan_id = ? and rank = ? ',[user_id,loan_id,rank])
    if(!isApproved?.length)await db.run('insert into LoanApproval (loan_id,user_id,rank) values (?,?,?)',[loan_id,user_id,rank])
        res.json({message:'success'})
});
router.get('/unapprove',async (req, res) => {
    const db =getDB(req)
    const {loan_id , user_id,rank} = req.query;
    const isApproved = await db.all('select * from LoanApproval where loan_id = ?' ,[loan_id])
    if(isApproved?.length)await db.run('delete from LoanApproval where loan_id = ? ',[loan_id])
        res.json({message:'success'})
});
router.get('/unapprovestep',async (req, res) => {
    const db =getDB(req)
    const {loan_id , user_id,rank} = req.query;
    const isApproved = await db.all('select * from LoanApproval where loan_id = ? and user_id = ?' ,[loan_id,user_id])
    if(isApproved?.length)await db.run('delete from LoanApproval where loan_id = ? and user_id = ?',[loan_id,user_id])
        res.json({message:'success'})
});

module.exports ={approvals_router: router};