
#//selecteive installation of modules and servers
#usage python3 install.py modulenames or backup or clients

import sys,os,re,json
import subprocess as s

from typing import Optional, List
from enum import Enum
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Body,Header,Request
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Field, Session, create_engine, select, or_,TEXT
from sqlalchemy import text
from pydantic import BaseModel
import random
import logging
import asyncio
from functools import wraps
import uvicorn
import json
import joblib as jb
import getpass
from sqlalchemy import case, or_, and_
import urllib.parse
import glob,httpx
import threading
import time
from datetime import date
#from google.cloud.firestore_v1 import Client
import uuid
today=date.today
#from datetime import UTC
from collections import defaultdict
import glob,httpx
import threading
import time
from datetime import date
#from google.cloud.firestore_v1 import Client
import uuid
today=date.today
#from datetime import UTC
from collections import defaultdict
import datetime as dtm
UTC=dtm.timezone.utc
# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

python ="python" if "win" in sys.platform else "python3"
sms_volume=None
if not 'win' in sys.platform:
    hostname='localhost'
    mysqluser="root"
    mysqlpass="spike%23%401012"
    mysqlport=20509
    fineract_db="postanasimu"
else:
    hostname='localhost'
    mysqluser="root"
    mysqlpass='mysql'
    mysqlport=3306
    fineract_db="mifostenant-default"    

if "creds.dex" in os.listdir('.'):
    creds=jb.load('creds.dex')
    mysqluser=creds['user']
    mysqlpass=creds['pas']
    mysqlport=int(creds['port'])
    fineract_db=creds['db']
    hostname=creds['host']

def findtomcatbase():
    path='.'
    pref="/bin/catalina.bat"
    if os.path.exists(path+pref):
        return os.path.abspath(path)
    path=''
    start='../'
    for i in range(3):
        path=path+start
        print(path)
        if os.path.exists(path+pref):
            return os.path.abspath(path)
    print('could not find tomcat installation directory. exiting...')
    sys.exit(1)
    
tomcatbase=findtomcatbase()

def setupCors(): 
    try:   
        print("setting up CorsFilter")
        filter="""<!--dexcors--><filter><filter-name>CorsFilter</filter-name><filter-class>org.apache.catalina.filters.CorsFilter</filter-class><init-param><param-name>cors.allowed.origins</param-name><param-value>*</param-value></init-param><init-param><param-name>cors.allowed.methods</param-name><param-value>GET,POST,HEAD,OPTIONS,PUT,DELETE</param-value></init-param><init-param><param-name>cors.allowed.headers</param-name><param-value>Origin,Content-Type,Accept,Authorization</param-value></init-param><init-param><param-name>cors.exposed.headers</param-name><param-value>Location</param-value></init-param><init-param><param-name>cors.support.credentials</param-name><param-value>false</param-value></init-param></filter><filter-mapping><filter-name>CorsFilter</filter-name><url-pattern>*</url-pattern></filter-mapping><!--dexcors-->"""
        web=tomcatbase+"/conf/web.xml"
        ctxt=open(web).read()
        if ctxt.find("<!--dexcors-->")>=0:
            #ctxt=re.sub("<\\!\\-\\-dexcors[\\w\\W]+dexcors\\-\\->",filter,ctxt)
            pass
        else:
            ctxt=ctxt.replace("<web-app>","<web-app>"+filter,1)
            f=open(web,"w")
            f.write(ctxt)
            f.close()
    except:
        print("Could not setup cors filter: an error occurred")



def installServer():
    global sms_volume
    global hostname,mysqlpass,mysqlport,mysqluser,fineract_db
    serverpath="/etc/systemd/system/dexstudios.service"
    if not 'win' in sys.platform and not os.path.exists(serverpath):
        startcmd=f"/usr/local/bin/python3 {tomcatbase}/app.py"
        serverdesc=f""" 
        [Unit]
        Description=Dexstudios API Server
        After=network.target
        [Service]
        ExecStart={startcmd}
        WorkingDirectory={tomcatbase}/bin
        StandardOutput=journal
        StandardError=journal
        Restart=always
        User=root
        [Install]
        WantedBy=multi-user.target"""
        open(serverpath,"w").write(serverdesc)
        os.system(f"sudo systemctl enable dexstudios")
        os.system(f"sudo systemctl enable dexstudios")
        os.system(f"sudo systemctl start dexstudios")
        setupCors()
        addMifosComponents()
        print("Server Setup Complete.")
        sms_volume=1500000
        host=input("enter the host name")
        user=input('enter mysql username')
        pas=getpass.getpass('enter mysql password')
        port=input ('enter mysql port ')
        db=input('enter mysql fineract db name')
        if host:
            hostname=host
        if user:
            mysqluser=user
        if pas:
            mysqlpass=urllib.parse.quote(pas)  
        if port:
            mysqlport=port  
        if db:
            fineract_db=db
        creds=dict(host=hostname,user=mysqluser,pas=mysqlpass,port=mysqlport,db=fineract_db)
        jb.dump(creds,"creds.dex")
        sys.exit(0)
        


def addMifosComponents():
    import shutil
    try:
        shutil.copy("./mifosXComponents",f'{tomcatbase}/webapps/ROOT/scripts')
        shutil.copy("./nvd3",f'{tomcatbase}/webapps/ROOT/scripts')
        shutil.copy("./dexstudios.js",f'{tomcatbase}/webapps/ROOT/scripts')
        shutil.copy("./self.zip",f'{tomcatbase}/webapps/')
        os.system("cd ../webapps & unzip self.zip & A")
    except:
        pass

COMPANY='MAGEREZA\n'

#admin user
if  'mifosadmin.txt' in os.listdir('.'):
    MIFOSADMIN=str(open('mifosadmin.txt').read()).strip()
else:
    print('Fineract credentials not found (mifosadmin.txt)')
    sys.exit(1)

if  'company.txt' in os.listdir('.'):
    COMPANY=str(open('company.txt').read()).strip()
else:
    print('Company Name not found (company.txt)')
    sys.exit(1)
#initialize sms counting
if not sms_volume:
    sms_volume=0

#sms pricing
pricing={'entreprise':16,'pro':17,'work':18,'streak':19}
package='streak'
destnmb='0763458083'
#last fetched campaign messages
lastcp=0

# MySQL connection string
SERVER_URL = f"mysql+mysqlconnector://{mysqluser}:{mysqlpass}@localhost:{mysqlport}"
engine = create_engine(SERVER_URL)
with engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS dex_sms"))
        conn.commit()

# MySQL connection string
MYSQL_URL = f"mysql+mysqlconnector://{mysqluser}:{mysqlpass}@localhost:{mysqlport}/dex_sms"
FIN_URL = f"mysql+mysqlconnector://{mysqluser}:{mysqlpass}@localhost:{mysqlport}/{fineract_db}"

# Engine setup
engine = create_engine(MYSQL_URL, echo=False)
Fengine = create_engine(FIN_URL, echo=False)

#add the updated at column to campaign messages
with Session(Fengine) as session:
    result=session.exec(text("show columns from sms_messages_outbound like 'updated_at'")).all() #session.execute(text("select count(*) from information_schema.columns where table_schema = 'mifostenant-default' and table_name = 'sms_messages_outbound' and column_name = 'updated_at'")).all()
    print(result)
    if not result:#[0][0]:
        session.exec(text(" alter table sms_messages_outbound add column `updated_at` timestamp default current_timestamp on update current_timestamp"))
        session.commit()
        print("altered table")
#initialise the sms volume


app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Enum for status
class SMSStatus(str, Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    IN_TRANSIT = "IN_TRANSIT"
    FAILED = "FAILED"
    DELETED = "DELETED"
    CANCELLED = "CANCELLED"
    DELIVERED = "DELIVERED"

status_map=dict(PENDING=100,IN_TRANSIT=150,SENT=200,DELIVERED=300,FAILED=400)
reverse_status={100:SMSStatus.PENDING,150:SMSStatus.IN_TRANSIT,200:SMSStatus.SENT,300:SMSStatus.DELIVERED,400:SMSStatus.FAILED}
            
#SMS Type
class SMSType(str,Enum):
    GENERAL="GENERAL"
    OTP="OTP"
    CAMPAIGN="CAMPAIGN"


# Package table
class SMSBundle(SQLModel, table=True):
    __table_args__ = {"extend_existing": True}
    id: Optional[int] = Field(default=None, primary_key=True)
    name:str  
    price:str  
    sms_volume:str  

# SMS table
class SMSSettings(SQLModel, table=True):
    __table_args__ = {"extend_existing": True}
    id: Optional[int] = Field(default=None, primary_key=True)
    settings: str=Field(sa_type=TEXT)
    sms_volume:int=Field(default=1500)
    package:str=Field(default='streak')
    hostname:str=Field(default=hostname if hostname else None)
    
# SMS table
class SMS(SQLModel, table=True):
    __table_args__ = {"extend_existing": True}
    id: Optional[int] = Field(default=None, primary_key=True)
    receiver: str
    message: str
    otp:str= Field(default=None,nullable=True)
    error:str= Field(default=None,nullable=True)
    status: SMSStatus = Field(default=SMSStatus.PENDING)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    type:SMSType=Field(default=SMSType.GENERAL)

# Update model
class SMSStatusUpdate(SQLModel,BaseModel):
    id: int
    status: SMSStatus
    error:str=None
    type:str=SMSType.GENERAL


# Update model
class VCN(SQLModel,table=True):
    __table_args__ = {"extend_existing": True}
    id: Optional[int] = Field(default=None, primary_key=True)
    num: int

# SMS Settings table
class OTPSettings(SQLModel, table=True):
    __table_args__ = {"extend_existing": True}
    user_id: str = Field(primary_key=True)
    name:str=Field(default=None,nullable=True)
    mobileno: Optional[str] = None
    lastotptime: datetime=Field(default=None,nullable=True)
    created_at: Optional[datetime] = Field(default_factory=datetime.now)
    updated_at: Optional[datetime] = Field(default_factory=datetime.now,sa_column_kwargs={"onupdate": datetime.now})


def get_firestore_client():
    return Client.from_service_account_info(json.load(open("sc.json")))

#db = get_firestore_client()
loop = asyncio.get_event_loop()

# Pydantic model for transaction data
class BundleTransaction(SQLModel,table=True):
    __table_args__ = {"extend_existing": True}
    id: Optional[int] = Field(default=None, primary_key=True)
    ref: str=Field(default=None)
    user_id: str=Field(default=None,nullable=True)
    status:str=Field(default='PENDING')
    amount: float=Field(default=None,nullable=True)
    sender: str=Field(default=None,nullable=True)
    transaction_id: str=Field(default=None,nullable=True)
    paid_date: datetime=Field(default=None,nullable=True)
    sms_text: str=Field(default=None,nullable=True)
    package:str=Field(default='streak',nullable=True)
    used:int=Field(default=0)
# --------------------Click Pesa Models --------------------
class Transaction(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    clientId: int
    savingsId:int
    status: str = Field(default="PENDING")
    amount: float
    phoneNumber: str=""
    currency: str="TZS"
    type:str
    orderReference: str
    createdDate: datetime = Field(default_factory=datetime.now)
    updatedDate: datetime = Field(default_factory=datetime.now)
    


import base64,inspect

def decode_basic_auth_header(basic_auth_header: str):
    if not basic_auth_header.lower().startswith("basic "):
        #raise ValueError("Invalid Basic Auth header")
        raise HTTPException(status_code=401, detail="Invalid Basic Auth header")
    encoded = basic_auth_header.split(" ")[1]
    decoded_bytes = base64.b64decode(encoded)
    decoded_str = decoded_bytes.decode("utf-8")
    if ":" not in decoded_str:
        #raise ValueError("Invalid credentials format")
        raise HTTPException(status_code=401, detail="Invalid credentials format")
    username, password = decoded_str.split(":", 1)
    return username, password

def authenticate():
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Find the request object in args or kwargs
            if not 'authorization' in kwargs or not kwargs['authorization'] or kwargs['authorization'].strip()=='':
                raise HTTPException(status_code=401, detail="Authorization header missing")
            #print(kwargs['authorization'])
            # Verify the token by calling the auth endpoint
            try:
                async with httpx.AsyncClient(verify=False,timeout=20) as client:
                    name,word=decode_basic_auth_header(kwargs['authorization'])
                    response = await client.post(
                        f"https://localhost/fineract-provider/api/v1/{'self/' if 'self' in kwargs else ''}authentication",  # Adjust base URL as needed
                        headers={"Authorization": kwargs['authorization'],'Fineract-Platform-TenantId':'default'},
                        json={'username':name,'password':word}
                    )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=401,
                        detail=f"Authentication failed: {response.text}"
                    )
            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=503,
                    detail=f"Auth service not reachable: {str(exc)}"
                )
            # Determine if the route handler is async or sync
            if inspect.iscoroutinefunction(func):
                return await func(*args, **kwargs)
            else:
                return func(*args, **kwargs)
        return wrapper
    return decorator
# Firestore snapshot callback
def on_snapshot(col_snapshot, changes, read_time):
    for change in changes:
        if change.type.name == "MODIFIED":
            doc = change.document.to_dict()
            if doc.get("status") == "complete":
                print(f"[Firestore] Completed: {change.document.id}")
                # Dispatch async POST from sync context
                asyncio.run_coroutine_threadsafe(notify_fastapi(doc),loop)
                #asyncio.create_task(notify_fastapi(doc))

# Async HTTP POST to FastAPI endpoint
async def notify_fastapi(data: dict):
    try:
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(
                "https://localhost:8334/transaction-complete", json=data
            )
            print(f"[FastAPI] Notified: {response.status_code}")
    except Exception as e:
        print(f"[FastAPI] Notification failed: {e}")


# Firestore listener setup
def start_firestore_listener():
    col_ref = db.collection("bundle_transactions")
    col_ref.on_snapshot(on_snapshot)


 
def update_sms_volume(data:BundleTransaction):
    global sms_volume
    vol=None
    if not data.amount or not data.package:
        return None
    vol=int(data.amount)#pricing[data.package]
    if sms_volume:
        vol=sms_volume+vol
    if vol:
        with Session(engine) as session:
            s=session.get(SMSSettings,1)
            s.sms_volume=vol  
            sms_volume=vol
            session.commit()

# FastAPI endpoint to receive notification
@app.post("/transaction-complete")
async def transaction_complete(data: BundleTransaction=Body()):
    global package
    with Session(engine) as session:
        if data.package:
            package=data.package
            s=session.get(SMSSettings,1)
            s.package=data.package
            session.commit()
        tr=session.exec(select(BundleTransaction).where(and_(BundleTransaction.status=='PENDING',BundleTransaction.ref==data.ref)))
        if tr:
            tr=tr.one()
            tr.status='complete'
            tr.used=1
            update_sms_volume(tr)
            session.commit()
            return {"sms_volume": sms_volume}
    raise HTTPException(status_code=404,detail="Transaction Not Found")

@app.post("/transaction-start")
@authenticate()
async def transaction_start(data:BundleTransaction=Body(),authorization:str = Header(...)):
    def create_firestore_transaction(tr):
        col_ref = db.collection("bundle_transactions")
        col_ref.add(dict(tr))
    with Session(engine) as session:
        data.ref='DX'+str(random.randint(100,900))
        session.add(data)
        session.commit()
        #create_firestore_transaction(data)
        res= session.get(BundleTransaction,data.id).dict()
        res['amount']=int(res['amount'])
        res['code']=f'<br><ul><li>Tigo: *100*2*3*3*{res["amount"]}*{destnmb}*{res["ref"]}# </li><li>Halotel: *100*2*3*3*{res["amount"]}*{destnmb}*{res["ref"]}# </li><li>Airtel: *100*2*3*3*{res["amount"]}*{destnmb}*{res["ref"]}# </li><li>Vodacom: *100*2*3*3*{res["amount"]}*{destnmb}*{res["ref"]}# </li></ul>'
        return res
    raise HTTPException(status_code=500,detail="server error")

@app.post("/transaction-check")
@authenticate()
async def transaction_check(data: BundleTransaction=Body(),authorization:str = Header(...)):
    with Session(engine) as session:
        tr=session.exec(select(BundleTransaction).where(and_(BundleTransaction.ref==data.ref,BundleTransaction.status=='complete'))).all()
        print(tr)
        if tr:
            return {'sms_volume':session.get(SMSSettings,1).sms_volume}
    raise HTTPException(status_code=404,detail="Transaction not completed")



@app.get("/otp/{target}", status_code=201)
@authenticate()
def create_otp_for_user(target: str,authorization:str=Header(...)):
    otptemplate="Dear {}, Your OTP is {}"
    with Session(engine) as session:
        settings = session.get(OTPSettings, target)
        if not settings or not settings.mobileno:
            raise HTTPException(status_code=404, detail="Mobile number not found.")
        otp_code = "".join(str(random.randint(0, 9)) for _ in range(6))
        name = "user"
        if settings.name:
            name=settings.name
        message=otptemplate.format(name ,otp_code)
        otp = SMS(receiver=settings.mobileno, otp=otp_code,message=message)
        session.add(otp)
        session.commit()
        return {"message": "SMS created", "otp_id": otp.id}

@app.get("/otp/phone/{target}", status_code=201)
@authenticate()
def create_otp_for_number(target: str,authorization:str=Header(...),template=None,cname=None):
    otptemplate=template or "Dear {}, Your OTP is {}"
    with Session(engine) as session:
        otp_code = "".join(str(random.randint(0, 9)) for _ in range(6))
        print(otp_code)
        name =cname or "user"
        message=COMPANY+otptemplate.format(name ,otp_code)
        otp = SMS(receiver=target, otp=otp_code,message=message)
        session.add(otp)
        session.commit()
        return {"message": "SMS created", "otp_id": otp.id}

@app.get("/otp/{otp}/verify")
@authenticate()
def verify_otp(otp: str,authorization:str = Header(...)):
    with Session(engine) as session:
        valid_otps = session.exec(
            select(SMS).where(
                SMS.otp == otp,
                SMS.created_at > datetime.now() - timedelta(minutes=5)
            )
        ).all()
        if not valid_otps:
            raise HTTPException(status_code=404, detail="Invalid otp")
        for o in valid_otps:
            session.delete(o)
        session.commit()
        return {"message": "otp verified"}


@app.get("/otpsettings/{user_id}", response_model=Optional[OTPSettings])
@authenticate()
def get_otp_settings(user_id: str,authorization:str = Header(...)):
    with Session(engine) as session:
        return session.get(OTPSettings, user_id)


@app.put("/otpsettings/{user_id}")
@authenticate()
def update_otp_settings(user_id: str, settings: OTPSettings = Body(),authorization:str = Header(...)):
    with Session(engine) as session:
        existing = session.get(OTPSettings, user_id)
        #print(datetime.fromtimestamp(settings.lastotptime))
        #return {}
        if existing:
            existing.mobileno = settings.mobileno
        else:
            session.add(OTPSettings(
                user_id=user_id,
                mobileno=settings.mobileno,
            ))
        session.commit()
        return {"message": "Settings updated"}

async def delete_expired_otps():
    while True:
        try:
            # Run every minute
            await asyncio.sleep(60)

            # Get the current time
            now = datetime.now()

            # Create a session for querying the database
            with Session(engine) as session:
                # Delete SMSs older than 5 minutes and still in PENDING state
                expired_otps = session.exec(
                    select(SMS).where(SMS.otp.is_not(None),
                        SMS.created_at < (now - timedelta(minutes=5)),
                        SMS.status == 'PENDING'
                    )
                ).all()
                if expired_otps:
                    for otp in expired_otps:
                        otp.status = 'DELETED'  # Mark as deleted
                        session.add(otp)

                    # Commit the changes to the database
                    session.commit()
                    print(f"Deleted {len(expired_otps)} expired SMS(s).")
            with Session(Fengine) as session:
                camps=session.exec(text("select id from sms_campaign where status_enum=300")).all()
                session.exec(text(f" update `sms_messages_outbound` set `status_enum` = 100 where `updated_at` < :time and `status_enum` = 150 and `campaign_id` in (:camps)"),params=[{'time':now-timedelta(hours=1),'camps':",".join([str(c[0]) for c in camps])}])
                session.commit()
                #print("updated expired campain messages")

        except Exception as e:
            print(f"Error during SMS cleanup: {e}")
            await asyncio.sleep(60) 

@app.post("/messages")
@authenticate()
def create_sms(sms:SMS=Body(),authorization:str = Header(...)):
    with Session(engine) as session:
        #sms.receiver="0763458083"
        session.add(sms)
        session.commit()



@app.get("/messages", response_model=List[SMS])
#@authenticate()
def get_PENDING_sms(status: Optional[str] = None, networks: Optional[str] = None, limit: int = 60,authorization:str|None = Header(default=None)):
    global sms_volume
    if networks and sms_volume<1:
            raise HTTPException(status_code=501, detail="SMS Volume Depleted.")

    with Session(engine) as session:
        query = select(SMS)

        # Base filter:
        # - OTPs must be PENDING
        # - OR non-OTPs (otp is None)
        if not networks:
            query=query.where(
                SMS.otp.is_(None))

        # Apply additional status filter to non-OTPs if desired
        if status:
            query = query.where( SMS.status == status)         # apply status to non-OTPs only

        # Apply network prefix filter if provided
        if networks:
            pass
            '''networks = networks + ",076" #076 for development
            prefixes = networks.split(",")
            like_clauses = []
            for prefix in prefixes:
                core = prefix.lstrip("0")
                like_clauses.extend([
                    SMS.receiver.like(f"{prefix}%"),
                    SMS.receiver.like(f"{core}%"),
                    SMS.receiver.like(f"255{core}%"),
                    SMS.receiver.like(f"+255{core}%"),
                ])
            query = query.where(or_(*like_clauses))'''

        # Order: PENDING OTPs → others → newest first
        query = query.order_by(
            case((and_(SMS.otp.is_not(None), SMS.status == "PENDING"), 0), else_=1),
            SMS.created_at.desc()
        ).limit(limit)

        results = session.exec(query).all()
        if len(results)<limit and networks:
            results= get_camp_msgs(results,limit,status=status,networks=networks,fsession=Session(Fengine))
        if not results:
            raise HTTPException(status_code=404, detail="No matching SMSs found.")
        
        return results

def get_camp_msgs(results,limit,camps=None,status=None,networks=None,fsession=Session(Fengine),itern=0):
            global status_map
            global reverse_status
            global lastcp
            if isinstance(status,str):
                initialstatus=status
                status=status_map[status]
            if not camps:
                camps=fsession.exec(text("select id from sms_campaign where status_enum=300")).all()
            if camps:
                if not networks:
                    index=itern
                else:
                    index=lastcp
                if itern==0 and networks:
                    lastcp=lastcp+1#changes with request to serve diff campaigns for android senders
                cid=camps[index%len(camps)][0]

                msgs=fsession.exec(text(f"select id , mobile_no , message ,status_enum,submittedon_date from sms_messages_outbound where campaign_id = {cid} {'and status_enum = '+str(status) if status else '' }  limit {limit-len(results)}")).all()
                if msgs:
                    for m in msgs:
                        results.append(SMS(id=m[0],receiver=m[1],message=m[2],type=SMSType.CAMPAIGN,status=reverse_status[m[3]],created_at=datetime(m[4].year,m[4].month,m[4].day)))
                    fsession.exec(text(f"update sms_messages_outbound set status_enum = 150 where id in ({', '.join([str(m[0]) for m in msgs])})"))
                    fsession.commit()
                if(len(results)<limit and itern<len(camps)):
                    itern=itern+1
                    results= get_camp_msgs(results,limit,camps=camps,status=status,networks=networks,fsession=fsession,itern=itern)
            return results

@app.put("/messages/{id}/status")
@authenticate()
def update_otp_status(id:int,status:dict=Body(),authorization:str = Header(...)):
    global sms_volume
    if status['status'] == SMSStatus.SENT or status['status']==SMSStatus.DELIVERED:
        sms_volume=sms_volume-1
    with Session(engine) as session:
        sms=session.get(SMS,id)
        if sms:
            sms.status=status["status"]
            session.commit()
        elif 'type' in status and status['type']==SMSType.CAMPAIGN:
            with Session(Fengine) as fsession:
                rs=fsession.exec(text(f"update sms_messages_outbound set status_enum = {reverse_status[status['status']]} where id = {id}"))

    return {"message":"success"}

@app.post("/messages/status")
#@authenticate()
def update_sms_status(statuses: List[SMSStatusUpdate],authorization:str|None = Header(default=None)):
    global sms_volume
    used=[s for s in statuses if s.status == SMSStatus.SENT or s.status==SMSStatus.DELIVERED]
    sms_volume=sms_volume-len(used)
    with Session(engine) as session:
        sets=session.get(SMSSettings,1)
        sets.sms_volume=sms_volume
        for item in [s for s in statuses if s.type!=SMSType.CAMPAIGN]:
            otp = session.get(SMS, item.id)
            if not otp:
                raise HTTPException(status_code=404, detail=f"SMS ID {item.id} not found")
            otp.status = item.status
            if item.error:
                otp.error=item.error
        session.commit()
    with Session(Fengine) as session:
        for item in [s for s in statuses if s.type==SMSType.CAMPAIGN]: 
            session.exec(text(f"update sms_messages_outbound set status_enum = {reverse_status[s.status]} where id = {s.id}"))
        session.commit()
    
    return {"message": "Statuses updated successfully."}


        
@app.get("/settings")
@authenticate()
def get_settings(authorization:str = Header(...)):
    with Session(engine) as session:
        global sms_volume
        sets=session.get(SMSSettings,1)
        if not sets:
            raise HTTPException(status_code=404, detail="No settings saved")
        else:
            sets= json.loads(sets.settings)
            sets['sms_volume']=sms_volume
            return sets
@app.post("/settings")
@authenticate()
def set_settings(sts:dict,authorization:str = Header(...)):
    with Session(engine) as session:
        sets=session.get(SMSSettings,1)
        if not sets:
            sets=session.add(SMSSettings(settings=json.dumps(sts)))
        else:
            sets.settings=json.dumps(sts)
        session.commit()
        return {"message":"success"}

@app.get('/kpi')  
@authenticate()
def get_kpi(authorization:str = Header(...)):
    global sms_volume
    results={}
    sent=0
    failed=0
    with Session(engine) as session:
        sets=session.get(SMSSettings,1)
        if sets:
            sets=json.loads(sets.settings)
            results["sms_volume"]=sms_volume or sets['sms_volume'] 
        q=session.exec(text("select count(*) from sms where created_at >= :date and status ='FAILED'"),params=[{'date':today()}]).all()
        if q:
            failed=q[0][0]
        q=session.exec(text("select count(*) from sms where created_at >= :date and status ='SENT' or status = 'DELIVERED'"),params=[{'date':today()}]).all()
        if q:
            sent=q[0][0]
        results['deliverrate']=100*(sent/(000.1+sent+failed))
        results['sent_today']=sent

    return results
@app.get("/voucher")
@authenticate()
def get_voucher(authorization:str = Header(...)):
    with Session(engine) as session:
        vcn=session.get(VCN,1)
        if not vcn:
            vcn=VCN(num=1)
            session.add(vcn)
            session.commit()
        num=vcn.num 
        vcn.num=vcn.num+1
        session.commit()
        return {"vcn":num}


# --------------------Click Pesa Models --------------------
class CPTransaction(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    fineract_id: int = -1
    is_reversed:int = 0
    is_suspicious:int=0
    clientId: int
    savingsId:int
    status: str = Field(default="PENDING")
    amount: float
    phoneNo: str=''
    currency: str="TZS"
    method:str='' 
    bankName:str=''
    bic:str=''
    accountNo:str=''
    type:str
    remark:str=''
    orderReference: str
    createdDate: datetime = Field(default_factory=datetime.now)
    updatedDate: datetime = Field(default_factory=datetime.now)
    





# -------------------- FastAPI & ClickPesa Setup --------------------


CLICKPESA_API_KEY = "SKyn2i5AHM1oqswKL8vS9gFdSJgwS61t0rVb5M2cH4"
CLICKPESA_CLIENT_ID ="IDhPGYfPFq4kPGZXtuqPCunjn7zmoL98" #"IDPMdTAAtGVzXpwe068sJGfqNs1DgI1o" #"IDK9sBNnD7gyRnxK20WVkqw8BHXTtS3c"


TOKEN_URL = "https://api.clickpesa.com/third-parties/generate-token"

token_data = {
    "access_token": None,
    "expires_at": datetime.now(UTC)
}

# -------------------- Pydantic Payload --------------------
class WithdrawRequest(BaseModel):
    clientId: int
    savingsId:int=None
    amount: float
    phoneNo: str=''
    currency: str='TZS'
    orderReference: str=None
    checksum: str=None
    method:str=None
    accountNo:str=None
    bankName:str=None
    transferType:str='ACH'
    bic:str=None
    type:str=None
    remark:str=None

# -------------------- Token Utility --------------------
async def get_valid_token():
    global token_data
    #---dummy
    #return "Bearer dummy"
    now = datetime.now(UTC)
    if token_data["access_token"] and token_data["expires_at"] > now:
        return token_data["access_token"]
    if 'token.pkl' in os.listdir('.'):
        tk=jb.load('token.pkl')
        if tk["access_token"] and tk["expires_at"] > now:
            token_data=tk
            return tk["access_token"]
    async with httpx.AsyncClient(verify=False,timeout=20) as client:
        response = await client.post(TOKEN_URL, headers={
            "api-key": CLICKPESA_API_KEY,
            "client-id": CLICKPESA_CLIENT_ID
        })
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to authenticate with ClickPesa")
    resp = response.json()
    token_data["access_token"] = resp["token"]
    token_data["expires_at"] = now + timedelta(seconds=3600)
    jb.dump(token_data,'token.pkl')
    return token_data["access_token"]

# -------------------- DB Helpers --------------------
def get_PENDING_transaction(session: Session, client_id: int):
    #---dummy
    return None
    stmt = select(CPTransaction).where(
        CPTransaction.clientId == client_id,
        CPTransaction.status == "PENDING"
    )
    return session.exec(stmt).first()
banks_list=[]
#get banks list
@app.get("/bankslist")
async def get_banks():
    global banks_list
    if len(banks_list)>0:
        return banks_list
    token = await get_valid_token()
    headers = {"Authorization": token, "Content-Type": "application/json"}
    preview_resp = await httpx.AsyncClient(verify=False,timeout=20).get(
            "https://api.clickpesa.com/third-parties/list/banks",
            headers=headers
        )
    if preview_resp.status_code==200:
        banks_list= preview_resp.json()
        return banks_list
    return {}

# -------------------- Withdraw Endpoint --------------------
async def preview_withdraw(payload,headers,bank=False):
    #---dummy
    #return True
    # Preview
    if bank:
        preview_resp = await httpx.AsyncClient(verify=False,timeout=20).post(
            "https://api.clickpesa.com/third-parties/payouts/preview-bank-payout",
            headers=headers, json=payload
        )
    else:
        preview_resp = await httpx.AsyncClient(verify=False,timeout=20).post(
            "https://api.clickpesa.com/third-parties/payouts/preview-mobile-money-payout",
            headers=headers, json=payload
        )
    if preview_resp.status_code != 200:
        raise HTTPException(status_code=preview_resp.status_code, detail=f"Payout preview failed: {preview_resp.text}")
    return True

async def init_withdraw(payload,headers,bank=False):
    #---dummy
    #return True
    if bank:
        create_resp = await httpx.AsyncClient(verify=False,timeout=20).post(
            "https://api.clickpesa.com/third-parties/payouts/create-bank-payout",
            headers=headers, json=payload,timeout=20
        )
    else:
        create_resp = await httpx.AsyncClient(verify=False,timeout=20).post(
        "https://api.clickpesa.com/third-parties/payouts/create-mobile-money-payout",
        headers=headers, json=payload,timeout=20
        )
    if create_resp.status_code != 200:
        raise HTTPException(status_code=create_resp.status_code, detail=f"Payout creation failed: {create_resp.text}")
    return True

import re
def normalize_mobile_number(raw_number):
    digits = re.sub(r'\D', '', raw_number)  # Remove non-digit characters
    if digits.startswith("0"):
        return "255" + digits[1:]
    elif digits.startswith("255"):
        return digits
    elif digits.startswith("7") and len(digits) == 9:
        return "255" + digits
    else:
        raise ValueError(f"Unrecognized format: {raw_number}")

def extract_mobile_number(text):
    # Pattern: match optional +, optional 255 or 0, followed by 7 and 8 digits
    pattern = re.compile(r'(?:\+?255|0)?\d{9}')
    match = pattern.search(text)
    if match:
        return match.group()
    return None

# -------------------- Withdraw Endpoint --------------------
async def preview_deposit(payload,headers):
    #---dummy
    #return True
    # Preview
    preview_resp = await httpx.AsyncClient(verify=False,timeout=20).post(
        "https://api.clickpesa.com/third-parties/payments/preview-ussd-push-request",
        headers=headers, json=payload
    )
    print(preview_resp.text)
    if preview_resp.status_code != 200:
        raise HTTPException(status_code=preview_resp.status_code, detail=f"Payout preview failed: {preview_resp.text}")
    return True

async def init_deposit(payload,headers):
    #---dummy
    #return True
    create_resp = await httpx.AsyncClient(verify=False,timeout=20).post(
        "https://api.clickpesa.com/third-parties/payments/initiate-ussd-push-request",
        headers=headers, json=payload,timeout=20
    )
    print(create_resp.text)
    if create_resp.status_code != 200:
        raise HTTPException(status_code=create_resp.status_code, detail=f"Payout creation failed: {create_resp.text}")
    return True


#deposit data
'''
{
                        phoneNo:vm.depositFormData.phoneNo,
                        amount:vm.depositFormData.amount,
                        savingsId:vm.depositFormData.toAccount.accountId,
                        clientId:vm.clientId,
                        depositDescription:vm.depositFormData.remark
                    }

'''
import re
@app.post("/deposit")
@authenticate()
async def create_deposit(withdraw: WithdrawRequest, authorization: str = Header(...),self=1):
    #authorization="Basic YXR1OnBhc3N3b3Jk"
    withdraw.type="DEPOSIT"
    withdraw.orderReference=re.sub(r'[^a-zA-Z0-9]','',str(uuid.uuid4()))
    if not withdraw.clientId:
        raise HTTPException(status_code=417, detail="ClientID not found.")
    if not withdraw.savingsId:
        raise HTTPException(status_code=417, detail="SavingsId not found.")
    raw = extract_mobile_number(withdraw.phoneNo or '')
    if raw:
            m = normalize_mobile_number(raw)
            print("Formatted:", m)
            withdraw.phoneNo=m
    else:
        withdraw.phoneNo=None
    if not withdraw.phoneNo:
        raise HTTPException(status_code=417,detail="Invalid phoneNo")     
    # Use SQLModel session
    with Session(engine) as session:
        if get_PENDING_transaction(session, withdraw.clientId):
            raise HTTPException(status_code=417, detail="Client has a PENDING transaction. Try again later.")         
    token = await get_valid_token()
    headers = {"Authorization": token, "Content-Type": "application/json"}
    payout_payload = {
        "amount": withdraw.amount,
        "phoneNumber": withdraw.phoneNo,
        "currency": withdraw.currency,
        "orderReference": withdraw.orderReference
    }
    pr=False
    init=False
    #for i in range(3):
    pr=await preview_deposit(payout_payload,headers)
    if pr:
        init=await init_deposit(payout_payload,headers)
    if init:
        with Session(engine) as session:
            tx = CPTransaction(
                **withdraw.model_dump()
            )
            session.add(tx)
            session.commit()
            session.refresh(tx)
            return tx
    return {
            'status':'error',
            "message": "Transaction failed"
            }
from datetime import date
withdraw_attempts=defaultdict(int)  
withdraw_totals=defaultdict(float)
day=date.today()
def validate_withdraw_limits(clientId,amount):
    global withdraw_totals,withdraw_attempts,day
    if not day == date.today():
        withdraw_attempts=defaultdict(int)  
        withdraw_totals=defaultdict(float)
        day=date.today()
    if withdraw_totals[clientId]+amount > 1000000:
        raise HTTPException(status_code=401,detail="maximum daily withdrawable amount exceeded")
    if withdraw_attempts[clientId]+1 > 5:
        raise HTTPException(status_code=401,detail="maximum daily withdraw attempts exceeded")

#withdraw data
'''


  // Transforming Request Data
            var withdrawData = {
                fromOfficeId: vm.withdrawFormData.fromAccount.officeId,
                fromClientId: vm.withdrawFormData.fromAccount.clientId,
                fromAccountType: vm.withdrawFormData.fromAccount.accountType.id,
                fromAccountId: vm.withdrawFormData.fromAccount.accountId,
                dateFormat: "dd MMMM yyyy",
                locale: "en",
                withdrawDate: vm.withdrawFormData.withdrawDate,
                withdrawAmount: "" + vm.withdrawFormData.amount,
                withdrawDescription: vm.withdrawFormData.remark,
                method: vm.withdrawFormData.method.name,
                accountNo: vm.withdrawFormData.accountNo,
                phoneNo: vm.withdrawFormData.phoneNo,

            }





'''
@app.post("/withdraw")
@authenticate()
async def create_withdrawal(withdraw: WithdrawRequest, authorization: str = Header(...),self=1):
    #authorization="Basic YXR1OnBhc3N3b3Jk"
    withdraw.type="WITHDRAW"
    if not withdraw.clientId:
        raise HTTPException(status_code=417, detail="ClientID not found.")
    validate_withdraw_limits(withdraw.clientId,withdraw.amount or 0)
    withdraw.orderReference=re.sub(r'[^a-zA-Z0-9]','',str(uuid.uuid4()))
    # Use SQLModel session
    with Session(engine) as session:
        if get_PENDING_transaction(session, withdraw.clientId):
            raise HTTPException(status_code=417, detail="Client has a PENDING transaction. Try again later.") 
    # Check account balance
    async with httpx.AsyncClient(verify=False,timeout=20) as client:
        acc_resp = await client.get(
            f"https://localhost/fineract-provider/api/v1/self/clients/{withdraw.clientId}/accounts",
            headers={
                "Fineract-Platform-Tenantid": "default",
                "Authorization": authorization
            }
        )
    if acc_resp.status_code != 200:
        raise HTTPException(status_code=417, detail="Error fetching account details")
    accounts = acc_resp.json()
    valid_account = next(
        (a for a in accounts['savingsAccounts'] if "accountBalance" in a and a["accountBalance"] >= withdraw.amount and "productName" in a and a["productName"] == "AMANA WALLET" ),
        None
    ) if "savingsAccounts" in accounts else None
    #print("CLICK PESA ACC "+str(valid_account))
    if not valid_account:
        raise HTTPException(status_code=417, detail="Not enough money on your  account create a 'click pesa' account")
    withdraw.savingsId=valid_account['id']
    #check the clients mobile no
    # Check account balance
    async with httpx.AsyncClient(verify=False,timeout=20) as client:
        acc_resp = await client.get(
            f"https://localhost/fineract-provider/api/v1/self/clients/{withdraw.clientId}?fields=mobileNo",
            headers={
                "Fineract-Platform-Tenantid": "default",
                "Authorization": authorization
            }
        )
    if acc_resp.status_code != 200:
        raise HTTPException(status_code=417, detail="Client has no registered mobile Number")
    accounts = acc_resp.json()
    if "mobileNo" in accounts:
        m=accounts["mobileNo"]
        raw = extract_mobile_number(m)
        if raw:
            m = normalize_mobile_number(raw)
            print("Formatted:", m)
            withdraw.phoneNo=m
        else:
            raise HTTPException(status_code=417, detail="No valid number found.")
    else:
        raise HTTPException(status_code=417, detail="No valid number found.")
    token = await get_valid_token()
    headers = {"Authorization": token, "Content-Type": "application/json"}
    payout_payload = {
        "amount": withdraw.amount,
       # "phoneNumber": withdraw.phoneNo,
        "currency": withdraw.currency,
        "orderReference": withdraw.orderReference
    }
    pr=False
    init=False
    if withdraw.method=="Bank":
        payout_payload['bic']=withdraw.bic#next( b['bic'] for b in bankslist if b['name']==withdraw.bankName)
        payout_payload['accountNumber']=withdraw.accountNo
        payout_payload['transferType']='ACH'
        #for i in range(3):
        pr=await preview_withdraw(payout_payload,headers,bank=True)
        if pr:
            init=await init_withdraw(payout_payload,headers,bank=True)
            #break
    else:
        payout_payload['phoneNumber']=withdraw.phoneNo
        #for i in range(3):
        pr=await preview_withdraw(payout_payload,headers)
        if pr:
            init=await init_withdraw(payout_payload,headers)
            #break
    if  init:
        withdraw_attempts[withdraw.clientId] += 1
        withdraw_totals[withdraw.clientId] += withdraw.amount
        with Session(engine) as session:
            tx = CPTransaction(
               **withdraw.model_dump()
            )
            session.add(tx)
            session.commit()
            session.refresh(tx)
        return {
        "status": "success",
        "message": "Transaction created and payout initiated",
        'result':tx
        }
    return {
    'status':'error',
    "message": "Transaction failed",
    'result':None
    }
# -------------------- Search Guarantor ---------------------
@app.get("/clientsbyextid")
@authenticate()
def clientsbyextid(externalId:str,request:Request,authorization: str = Header(...),self=1):
    #data=dict(request.query_params)
    '''resp = httpx.get(
                        f"https://localhost/fineract-provider/api/v1/clients",
                        headers={"Authorization": MIFOSADMIN,"Fineract-Platform-Tenantid":"default", "Content-Type": "application/json"},
                        params=data,
                        timeout=10,verify=False
                    )
    if resp.status_code == 200:
        return resp.json()
    else:
        raise HTTPException(status_code=417,detail="Could not log transaction into fineract")'''
    with Session(Fengine) as session:
        query = text("""
            SELECT id, display_name ,external_id
            FROM m_client 
            WHERE external_id LIKE :external_id
            LIMIT 10
        """)
        ext=f'%{externalId}%'
        result = session.exec(query, params=[{"external_id":ext }])
        rows = result.fetchall()
        print(rows)
        if rows:
            return {"pageItems": [dict(id=r[0],displayName=r[1],externalId=r[2]) for r in rows]}

    return {"pageItems": []}

    
#-------------verify guarantor auth code---------------------
@app.get("/verifygcode")
@authenticate()
async def verifygcode(code:str,authorization: str = Header(...),self=1):
    return await verify_otp(code,authorization=MIFOSADMIN)


@app.get("/creategcode")
@authenticate()
async def creategcode(gclientId:str,type:str=None,authorization: str = Header(...),self=1):
    ctx=await clientcontacts(gclientId,authorization =authorization,self=1)
    authmessage=None
    if type=='guarantor':
        authmessage="Dear {}, please share this code {} with the requester to guarantee their loan."
    elif type=='withdraw':
        authmessage="Dear {}, please use this code {} to authorize your withdraw."
    if ctx and 'phoneNo' in ctx:
        gphoneNo=ctx['phoneNo']
        crt=await create_otp_for_number(gphoneNo,authorization= MIFOSADMIN,template=authmessage)
        print(crt)
        return crt
    raise HTTPException(status_code=417,detail="Could not find Guarantors Phone Number")

@app.post('/createguarantor')
@authenticate()
async def createguarantor(payload:dict ,authorization: str = Header(...),self=1):
    loanId=payload['loanId']
    del payload['loanId']
    async with httpx.AsyncClient(verify=False,timeout=20) as client:
        acc_resp = await client.post(
            f"https://localhost/fineract-provider/api/v1/loans/{loanId}/guarantors",
            headers={
                "Fineract-Platform-Tenantid": "default",
                "Authorization": MIFOSADMIN
            },
            json=payload
        )
    if acc_resp.status_code != 200:
        raise HTTPException(status_code=417, detail="Failed to create Guarantor in System.")
    return acc_resp.json()


@app.get('/clientcontacts')
@authenticate()
async def clientcontacts(clientId:str,authorization: str = Header(...),self=1):
    result={}
    async with httpx.AsyncClient(verify=False,timeout=20) as client:
        acc_resp = await client.get(
            f"https://localhost/fineract-provider/api/v1/clients/{clientId}?fields=mobileNo",
            headers={
                "Fineract-Platform-Tenantid": "default",
                "Authorization": MIFOSADMIN
            }
        )
    if acc_resp.status_code != 200:
        raise HTTPException(status_code=417, detail="Client has no registered mobile Number")
    accounts = acc_resp.json() or {}
    if "mobileNo" in accounts:
        m=accounts["mobileNo"]
        raw = extract_mobile_number(m)
        if raw:
            m = normalize_mobile_number(raw)
            print("Formatted:", m)
            result['phoneNo']=m
        else:
            raise HTTPException(status_code=417, detail="No valid number found.")
    else:
        raise HTTPException(status_code=417, detail="No valid number found.")
    if 'accountNo' in accounts:
        result['accountNo']=accounts['accountNo']
    return result
    
    
# -------------------- Background Watcher --------------------
def log_fineract_deposit(tx,session):
    resp = httpx.post(
                        f"https://localhost/fineract-provider/api/v1/savingsaccounts/{tx.savingsId}/transactions?command=deposit",
                        headers={"Authorization": MIFOSADMIN,"Fineract-Platform-Tenantid":"default", "Content-Type": "application/json"},
                        json={"transactionDate":tx.createdDate.strftime("%d %B %Y"),"voucherNumber":tx.orderReference,"transactionAmount":tx.amount,"paymentTypeId":4,"locale":"en","dateFormat":"dd MMMM yyyy","paymentDescription":tx.remark or ""},
                        timeout=10,verify=False
                    )
    if resp.status_code == 200:
        tx.fineract_id=resp.json()['resourceId']
        session.add(tx)
        session.commit()
        print('transaction deposited in fineract ')
    else:
        raise Exception("Could not log transaction into fineract")
def log_fineract_withdraw(tx,session):
    resp = httpx.post(
                        f"https://localhost/fineract-provider/api/v1/savingsaccounts/{tx.savingsId}/transactions?command=withdrawal",
                        headers={"Authorization": MIFOSADMIN,"Fineract-Platform-Tenantid":"default", "Content-Type": "application/json"},
                        json={"transactionDate":tx.createdDate.strftime("%d %B %Y"),"voucherNumber":tx.orderReference,"transactionAmount":tx.amount,"paymentTypeId":4,"locale":"en","dateFormat":"dd MMMM yyyy","paymentDescription":tx.remark or ""},
                        timeout=10,verify=False
                    )
    if resp.status_code == 200:
        tx.fineract_id=resp.json()['resourceId']
        session.add(tx)
        session.commit()
        print('transaction withdrawn in fineract ')
    else:
        raise Exception("Could not log transaction into fineract")

#----------------------------REVERSALS -----------------------------
def log_fineract_reversal(tx,session):
    if tx.fineract_id==-1:
        return
    resp = httpx.post(
                        f"https://localhost/fineract-provider/api/v1/savingsaccounts/{tx.savingsId}/transactions/{tx.fineract_id}?command=undo",
                        headers={"Authorization": MIFOSADMIN,"Fineract-Platform-Tenantid":"default", "Content-Type": "application/json"},
                        json={"transactionDate":tx.createdDate.strftime("%d %B %Y"),"transactionAmount":0,"locale":"en","dateFormat":"dd MMMM yyyy"},
                        timeout=10,verify=False
                    )
    if resp.status_code == 200:
        tx.is_reversed=1
        session.add(tx)
        session.commit()
        print('transaction deposited in fineract ')
    else:
        raise Exception("Could not log reversal transaction into fineract")


def watch_transaction_status():
    while True:
        try:
            with Session(engine) as session:
                PENDING = session.exec(
                    select(CPTransaction).where(or_(CPTransaction.status == "PENDING",CPTransaction.status == "PROCESSING"))
                ).all()

            if not PENDING:
                print("No PENDING transactions to check.")
            else:
                token = asyncio.run(get_valid_token())
                for tx in PENDING:
                    time.sleep(2)
                    resp = httpx.get(
                        f"https://api.clickpesa.com/third-parties/{'payouts' if tx.type=='WITHDRAW' else 'payments' }/{tx.orderReference}",
                        headers={"Authorization": token, "Content-Type": "application/json"},
                        timeout=10
                    )
                    print(resp.json())
                    if resp.status_code == 400:
                        tx.status="ERROR"
                        if 'message' in resp.json():
                            tx.remark=resp.json()['message']
                        session.add(tx)
                        session.commit()
                    elif resp.status_code == 200:
                        status=resp.json()[0].get("status",None)    
                        print(f'{tx.id}-->{status}-->{tx.orderReference}')  
                        if status and (status != "PENDING" or status != "PROCESSING"):
                            if status in ("SETTLED","SUCCESS","AUTHORIZED"):
                                if tx.type=="WITHDRAW":
                                    log_fineract_withdraw(tx,session)
                                elif tx.type=="DEPOSIT":
                                    log_fineract_deposit(tx,session)
                            if status in ('REVERSED','REFUNDED','FAILED'):
                                log_fineract_reversal(tx,session)
                            tx_obj = tx
                            tx_obj.status = status
                            tx_obj.updatedDate = datetime.now(UTC)
                            session.add(tx_obj)
                            session.commit()
                            print(f"Transaction {tx.orderReference} updated to {status}")
                    else:
                        print(f"Failed to fetch status for {tx.orderReference}: {resp.status_code}")
        except Exception as e:
            print(f"[watch_transaction_status] Error: {e}")
        time.sleep(2)


#----------------------CLICK PESA WEBHOOK EVENT--------------------------------------------------------
class Event(BaseModel):
    status:str
    orderReference:str

ALLOWED_HOST="clickpesa.com"
@app.post('/webhook')
def clickpesa_webhook(data:Event,request:Request):
    if request.url.hostname != ALLOWED_HOST:
        raise HTTPException(status_code=403, detail="Forbidden: Not from allowed host: click pesa")
    with Session(engine) as session:
        tx = session.exec(
            select(CPTransaction).where(CPTransaction.orderReference == data.orderReference)
        ).one()
    if not tx:
        pass
        #raise HTTPException(status_code=417, detail="CPTransaction Not Found")
    else:
        status=data.status
        if status and status != "PENDING" and tx.status != status:
            if status in ("SETTLED",):#"SUCCESS",
                if tx.type=="WITHDRAW":
                    log_fineract_withdraw(tx,session)
                elif tx.type=="DEPOSIT":
                    log_fineract_deposit(tx,session)
            if status in ('REVERSED','REFUNDED'):
                    log_fineract_reversal(tx,session)
            tx.status = status
            tx.updatedDate = datetime.now(UTC)
            session.add(tx)
            session.commit()
    return {}






@app.on_event("startup")
def on_startup():
    start_background_watcher()
    global sms_volume,hostname,loop,package
    SQLModel.metadata.create_all(engine)
    asyncio.create_task(delete_expired_otps())
    with Session(engine) as session:
        result=session.get(SMSSettings,1)
        if not result:
            result=SMSSettings(settings='{"developer":"dexstudios uganda"}',sms_volume=1500,hostname=hostname)
            session.add(result) 
            session.commit()
        hostname=result.hostname
        sms_volume=result.sms_volume
        package=result.package
        print(result.sms_volume)
    loop = asyncio.get_event_loop()
    #loop.run_in_executor(None, start_firestore_listener)
    print("[Startup] Firestore listener started.") 

# -------------------- Startup Hook --------------------

def start_background_watcher():
    thread = threading.Thread(target=watch_transaction_status, daemon=True)
    thread.start()
    print("Started transaction watcher thread.")


ssl_certfile=os.path.abspath('../conf/fullchain.pem')
ssl_keyfile=os.path.abspath('../conf/privkey.pem')
if __name__=="__main__":
    if 'install' in sys.argv:
        #installServer()
        setupCors()
    elif ssl_certfile or 'key.pem' in os.listdir('.'):
        uvicorn.run(app,port=8334  #,log_level="trace"
          ,ssl_keyfile=ssl_keyfile if ssl_keyfile else "key.pem"
          ,ssl_certfile=ssl_certfile if ssl_certfile else "cert.pem" 
          ,host="0.0.0.0" )
    else:
        uvicorn.run(app,port=8334,host='0.0.0.0')
