// Create a reusable dexmodal container in the DOM
if (!document.getElementById('dexmodal-container')) {
  const container = document.createElement('div');
  container.id = 'dexmodal-container';
  container.style.position = 'fixed';
  container.style.top = 0;
  container.style.left = 0;
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.backgroundColor = 'rgba(0,0,0,0.5)';
  container.style.display = 'none';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';
  container.style.zIndex = 9999;
  document.body.appendChild(container);
}

async function dexmodal({ title, message, input = false, confirm = false }) {
  title=document.title  
  return new Promise((resolve) => {
    const container = document.getElementById('dexmodal-container');
    container.innerHTML = ''; // Clear any existing content
    container.style.display = 'flex';

    // Modal box
    const modal = document.createElement('div');
    modal.id = 'dexmodal-box';
    modal.style.background = '#fff';
    modal.style.padding = '20px';
    modal.style.borderRadius = '8px';
    modal.style.minWidth = '300px';
    modal.style.maxWidth = '90vw';
    modal.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
    modal.style.textAlign = 'center';
    modal.style.position = 'relative';

    // Title
    if (title) {
      const titleElem = document.createElement('h3');
      titleElem.id = 'dexmodal-title';
      titleElem.textContent = title;
      modal.appendChild(titleElem);
    }

    // Message
    if (message) {
      const messageElem = document.createElement('p');
      messageElem.id = 'dexmodal-message';
      messageElem.style.margin = '15px 0';
      messageElem.innerHTML = message;
      modal.appendChild(messageElem);
    }

    // Input (for prompt)
    let inputElem;
    if (input) {
      inputElem = document.createElement('input');
      inputElem.id = 'dexmodal-input';
      inputElem.type = 'text';
      inputElem.style.width = '90%';
      inputElem.style.padding = '8px';
      inputElem.style.marginBottom = '15px';
      inputElem.style.fontSize = '16px';
      modal.appendChild(inputElem);
      inputElem.focus();
    }

    // Buttons container
    const buttons = document.createElement('div');
    buttons.id = 'dexmodal-buttons';
    buttons.style.display = 'flex';
    buttons.style.justifyContent = 'center';
    buttons.style.gap = '10px';

    // OK button
    const okBtn = document.createElement('button');
    okBtn.id = 'dexmodal-okbtn';
    okBtn.textContent = 'OK';
    okBtn.style.padding = '8px 15px';
    okBtn.style.cursor = 'pointer';
    okBtn.style.border = 'none';
    okBtn.style.backgroundColor = '#007bff';
    okBtn.style.color = 'white';
    okBtn.style.borderRadius = '4px';
    okBtn.addEventListener('click', () => {
      container.style.display = 'none';
      resolve(input ? inputElem.value : true);
    });
    buttons.appendChild(okBtn);

    if (confirm) {
      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'dexmodal-cancelbtn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.padding = '8px 15px';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.style.border = 'none';
      cancelBtn.style.backgroundColor = '#6c757d';
      cancelBtn.style.color = 'white';
      cancelBtn.style.borderRadius = '4px';
      cancelBtn.addEventListener('click', () => {
        container.style.display = 'none';
        resolve(false);
      });
      buttons.appendChild(cancelBtn);
    }

    modal.appendChild(buttons);
    container.appendChild(modal);

    setTimeout(() => {
      const okBtn = document.getElementById('dexmodal-okbtn');
      document.addEventListener('keydown', function enterHandler(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (okBtn) okBtn.click();
          document.removeEventListener('keydown', enterHandler);
        }
      });
    });

    // Optional: Close on Escape key
    function escHandler(e) {
      if (e.key === 'Escape') {
        container.style.display = 'none';
        document.removeEventListener('keydown', escHandler);
        resolve(confirm ? false : null);
      }
    }
    document.addEventListener('keydown', escHandler);
  });
}


function show_alert(message){
    if(!$('#dex_show_alert').length){
        $('<div id="dex_show_alert" class="btn-warning" style="position:absolute;right:10px;top:100px;color:white;border-radius:5px;padding:3px;"></div>').appendTo("body")
    }
    $('#dex_show_alert').html(message).show('slow',function(){setTimeout(()=>{$(this).hide("fast")},3000)})
}

mifosX.ng.application.constant('settings',{
            gatewayUrl: `${window.location.origin}/sms`,
            apiKey: crypto.randomUUID(),
            senderId: 'FinLink',
            defaultTemplate: 'Hello {{client}}, {{message}}',
            rateLimit: 100,
            retryPolicy: 'simple',
            notifyOnFailure: true,
            enableDeliveryReports: true,
            otpeverylogin:false,
            sms_volume:0,
            sms_enabled:true,
          printsettings:   {
    name: document.title||" MicroFinance Co. Ltd.",
    address: "623 Finance Street, Dar-es-salaam, Tanzania",
    phone: "+123-456-7890",
    email: "info@postakk.com",
    logoUrl: "/images/mifos-logo-flat.png",
    theme:{
    fontFamily: "Roboto, sans-serif",
    fontSize: "13px",
    headerBgColor: "#e0e0e0",
    textColor: "#222",
    underlineStyle: "1px solid #000"
  }
  },

            features : [
                  { key: 'withdraw', label: 'Savings Withdrawals', enabled: true,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}},you have withdrawn {{transactionAmount}} on {{accountType}} account {{accountNo}} on {{transactionDate}}.\n {{companyName}}' },
                { key: 'deposit', label: 'Savings Deposits', enabled: true,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}},you have deposited {{transactionAmount}} on {{accountType}} account {{accountNo}} on {{transactionDate}}.\n {{companyName}}' },
                { key: 'activate', label: 'Account Activations', enabled: true ,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}},your {{accountType}} account {{accountNo}} has been activated on {{transactionDate}}.\n {{companyName}}'},
                { key: 'approval', label: 'Transaction Or Account Approvals', enabled: true,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}},your {{accountType}} account {{accountNo}} has been approved on {{transactionDate}}.\n {{companyName}}' },
                { key: 'repayment', label: 'Repayment Confirmation', enabled: true,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}},you have repayed {{transactionAmount}} on {{accountType}} account {{accountNo}} on {{transactionDate}}.\n {{companyName}}' },
                { key: 'closure', label: 'Account closures', enabled: true,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}},your {{accountType}} account {{accountNo}} has been closed on {{transactionDate}}.\n {{companyName}}' },
                { key: 'writeoff', label: 'Write Offs', enabled: true,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}},your {{accountType}} account {{accountNo}} has been written-off on {{transactionDate}}.\n {{companyName}}' },
                { key: 'disburse', label: 'Account Disbursements', enabled: true,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}}, {{transactionAmount}} has been disbursed to {{accountType}} account {{accountNo}} on {{transactionDate}}.\n {{companyName}}' },
                { key: 'undo', label: 'Revoked Transactions or Accounts', enabled: true ,templates:[],template:null,
            defaultTemplate: 'Dear {{clientName}}, {{transactionAmount}} {{accountType}} account {{accountNo}}  has been revoked on {{transactionDate}}.\n {{companyName}}'},
                { key: 'reject', label: 'Account Rejections', enabled: true ,templates:[],template:null,
            defaultTemplate:'Dear {{clientName}}, {{transactionAmount}} {{accountType}} account {{accountNo}}  has been rejected on {{transactionDate}}.\n {{companyName}}'}
        ]
                })
const get_sms= () => { fetch('http://localhost:3000/api/sms/volume')
.then(r=>r.json()).then(dt=>{
    if(!window.settings)window.settings={};
    window.settings.sms_volume=dt.sms_volume;
  });  };
  get_sms();
setInterval(async function(){
 get_sms();
},30000)