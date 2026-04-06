// App.jsx
// e-MKOPO FSP Bridge - Developer Test Console
// Single-file React application with shadcn/ui components

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ==================== UTILITY FUNCTIONS ====================
const prettifyXml = (xml) => {
  try {
    if (typeof xml !== 'string') {
      return JSON.stringify(xml, null, 2);
    }
    let formatted = '';
    let indent = 0;
    const tab = '  ';
    
    xml.split(/(<[^>]+>)/g).forEach(node => {
      if (!node.trim()) return;
      
      if (node.startsWith('</')) {
        indent--;
        formatted += tab.repeat(Math.max(0, indent)) + node + '\n';
      } else if (node.startsWith('<') && node.endsWith('/>')) {
        formatted += tab.repeat(indent) + node + '\n';
      } else if (node.startsWith('<')) {
        formatted += tab.repeat(indent) + node + '\n';
        if (!node.includes('<?') && !node.includes('<!')) {
          indent++;
        }
      } else {
        const text = node.trim();
        if (text) {
          formatted += tab.repeat(indent) + text + '\n';
        }
      }
    });
    
    return formatted.trim();
  } catch (error) {
    return typeof xml === 'string' ? xml : JSON.stringify(xml, null, 2);
  }
};

// ==================== CSS-IN-JS STYLES ====================
const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  sidebar: {
    width: '420px',
    borderRight: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0a0f1a',
  },
  sidebarHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #1e293b',
    backgroundColor: '#0f172a',
  },
  sidebarTitle: {
    fontSize: '14px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#64748b',
    marginBottom: '12px',
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  filterInput: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
  },
  filterSelect: {
    padding: '8px 12px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
    cursor: 'pointer',
  },
  activityList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  activityItem: {
    padding: '12px 20px',
    borderBottom: '1px solid #1e293b',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  activityItemHover: {
    backgroundColor: '#1e293b',
  },
  activityItemSelected: {
    backgroundColor: '#1e293b',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: '#3b82f6',
  },
  methodBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'monospace',
    marginRight: '10px',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 500,
    fontFamily: 'monospace',
  },
  endpoint: {
    fontSize: '13px',
    fontFamily: 'monospace',
    color: '#94a3b8',
    marginTop: '6px',
  },
  timestamp: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '4px',
  },
  duration: {
    fontSize: '10px',
    color: '#475569',
    marginLeft: '8px',
  },
  mainPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  topBar: {
    padding: '12px 24px',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  envSelector: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  envButton: {
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.15s',
  },
  actionButton: {
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#e2e8f0',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #1e293b',
    padding: '0 24px',
    backgroundColor: '#0f172a',
  },
  tab: {
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    color: '#64748b',
  },
  tabActive: {
    color: '#3b82f6',
    borderBottomColor: '#3b82f6',
  },
  contentPanel: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
  },
  jsonViewer: {
    backgroundColor: '#0a0f1a',
    borderRadius: '8px',
    padding: '16px',
    fontFamily: "'Fira Code', 'Monaco', monospace",
    fontSize: '12px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  errorHighlight: {
    backgroundColor: '#450a0a',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: '#ef4444',
    padding: '12px',
    marginBottom: '16px',
    borderRadius: '6px',
  },
  statsBar: {
    display: 'flex',
    gap: '20px',
    padding: '8px 24px',
    borderTop: '1px solid #1e293b',
    fontSize: '12px',
    color: '#64748b',
    backgroundColor: '#0a0f1a',
  },
};

// ==================== API CLIENT ====================
const API_BASE = {
  sandbox: '',
  staging: 'https://staging-fsp.example.com/api',
  production: 'https://fsp.example.com/api',
};

class ApiClient {
  constructor(baseUrl, fspCode, onLog) {
    this.baseUrl = baseUrl;
    this.fspCode = fspCode;
    this.onLog = onLog;
  }

  async request(method, endpoint, body = null, messageType = null) {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

    try {
      const headers = {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
      };

      let requestBody = body;
      if (body && typeof body === 'object') {
        requestBody = this.buildXmlDocument(messageType, body);
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body: requestBody,
      });

      const duration = Date.now() - startTime;
      const responseText = await response.text();

      const logEntry = {
        id: requestId,
        method,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        duration,
        timestamp: new Date().toISOString(),
        request: { headers, body: requestBody },
        response: { status: response.status, headers: Object.fromEntries(response.headers), body: responseText },
        isError: response.status >= 400,
      };

      this.onLog(logEntry);
      return { success: response.status < 400, data: responseText, logEntry };

    } catch (error) {
      const duration = Date.now() - startTime;
      const logEntry = {
        id: requestId,
        method,
        endpoint,
        status: 0,
        statusText: error.message,
        duration,
        timestamp: new Date().toISOString(),
        request: { headers: {}, body },
        response: { error: error.message },
        isError: true,
      };
      this.onLog(logEntry);
      return { success: false, error: error.message, logEntry };
    }
  }

  buildXmlDocument(messageType, data) {
    const msgId = `${this.fspCode}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    const toXml = (obj, indent = '') => {
      if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
          return obj.map(item => toXml(item, indent)).join('');
        }
        return Object.entries(obj).map(([key, value]) => {
          if (value === undefined || value === null) return '';
          if (typeof value === 'object') {
            return `${indent}<${key}>\n${toXml(value, indent + '  ')}${indent}</${key}>\n`;
          }
          const escaped = String(value).replace(/[<>&]/g, (c) => {
            if (c === '<') return '&lt;';
            if (c === '>') return '&gt;';
            if (c === '&') return '&amp;';
            return c;
          });
          return `${indent}<${key}>${escaped}</${key}>\n`;
        }).join('');
      }
      return String(obj);
    };

    const xml = `<Document>
  <Data>
    <Header>
      <Sender>${this.fspCode}</Sender>
      <Receiver>ESS_UTUMISHI</Receiver>
      <FSPCode>${this.fspCode}</FSPCode>
      <MsgId>${msgId}</MsgId>
      <MessageType>${messageType}</MessageType>
    </Header>
    <MessageDetails>
${toXml(data, '      ')}    </MessageDetails>
  </Data>
  <Signature>MOCK_SIGNATURE_FOR_${msgId}</Signature>
</Document>`;

    return xml;
  }

  parseXmlResponse(xml) {
    const match = xml.match(/<Description>([\s\S]*?)<\/Description>/);
    const codeMatch = xml.match(/<ResponseCode>(\d+)<\/ResponseCode>/);
    return {
      responseCode: codeMatch ? codeMatch[1] : null,
      description: match ? match[1] : xml,
    };
  }
}

// ==================== REACT COMPONENTS ====================

const JsonViewer = ({ data, isXml }) => {
  const [expanded, setExpanded] = useState(true);
  
  const formatContent = () => {
    if (!data) return 'null';
    if (isXml) {
      const prettified = prettifyXml(data);
      return prettified.length > 2000 && !expanded ? prettified.substring(0, 2000) + '...' : prettified;
    }
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const formatted = JSON.stringify(parsed, null, 2);
      return formatted.length > 1000 && !expanded ? formatted.substring(0, 1000) + '...' : formatted;
    } catch {
      return data;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ ...styles.actionButton, padding: '4px 10px', fontSize: '11px' }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(typeof data === 'string' ? data : JSON.stringify(data, null, 2))}
          style={{ ...styles.actionButton, padding: '4px 10px', fontSize: '11px' }}
        >
          Copy
        </button>
      </div>
      <pre style={styles.jsonViewer}>{formatContent()}</pre>
    </div>
  );
};

const ActivityItem = ({ item, isSelected, onClick }) => {
  const [hovered, setHovered] = useState(false);
  
  const getMethodColor = (method) => {
    switch(method) {
      case 'GET': return '#10b981';
      case 'POST': return '#3b82f6';
      case 'PUT': return '#f59e0b';
      case 'DELETE': return '#ef4444';
      default: return '#8b5cf6';
    }
  };

  const getStatusColor = (status) => {
    if (status >= 500) return '#ef4444';
    if (status >= 400) return '#f59e0b';
    if (status >= 200) return '#10b981';
    return '#64748b';
  };

  return (
    <div
      style={{
        ...styles.activityItem,
        ...(hovered && styles.activityItemHover),
        ...(isSelected && styles.activityItemSelected),
        borderLeftWidth: isSelected ? '3px' : '1px',
        borderLeftStyle: 'solid',
        borderLeftColor: getStatusColor(item.status),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(item)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ ...styles.methodBadge, backgroundColor: getMethodColor(item.method), color: '#fff' }}>
            {item.method}
          </span>
          <span style={{ ...styles.statusBadge, backgroundColor: getStatusColor(item.status), color: '#fff' }}>
            {item.status || 'ERR'}
          </span>
        </div>
        <span style={styles.duration}>{item.duration}ms</span>
      </div>
      <div style={styles.endpoint}>{item.endpoint}</div>
      <div style={styles.timestamp}>{new Date(item.timestamp).toLocaleTimeString()}</div>
      {item.isError && (
        <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>
          ⚠️ {item.statusText || 'Request failed'}
        </div>
      )}
    </div>
  );
};

const RequestInspector = ({ selectedItem, previewRequest }) => {
  const [activeTab, setActiveTab] = useState('request');
  
  const item = previewRequest || selectedItem;
  
  if (!item) {
    return (
      <div style={{ textAlign: 'center', color: '#64748b', marginTop: '40px' }}>
        Select an API call from the left panel or a test case to inspect details
      </div>
    );
  }

  const isXml = (typeof item.request?.body === 'string' && item.request?.body?.includes('<Document>')) || 
                (typeof item.response?.body === 'string' && item.response?.body?.includes('<Document>'));

  return (
    <div>
      {previewRequest && (
        <div style={{ ...styles.errorHighlight, backgroundColor: '#1e3a8a', borderLeftColor: '#3b82f6' }}>
          <strong style={{ color: '#3b82f6' }}>📋 Preview - Not sent yet</strong>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>
            {item.method} {item.endpoint}
          </div>
        </div>
      )}
      {item.isError && !previewRequest && (
        <div style={styles.errorHighlight}>
          <strong style={{ color: '#ef4444' }}>❌ Error: {item.statusText}</strong>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>
            {item.response?.error || 'Check server connectivity'}
          </div>
        </div>
      )}

      <div style={styles.tabs}>
        {['request', ...(previewRequest ? [] : ['response'])].map((tab) => (
          <div
            key={tab}
            style={{ ...styles.tab, ...(activeTab === tab && styles.tabActive) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab.toUpperCase()}
          </div>
        ))}
      </div>

      <div style={styles.contentPanel}>
        {activeTab === 'request' && (
          <>
            {previewRequest ? (
              <>
                <h4 style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 500 }}>Endpoint</h4>
                <pre style={{ ...styles.jsonViewer, marginBottom: '20px' }}>
                  {previewRequest.method} {previewRequest.endpoint}
                </pre>
                <h4 style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 500 }}>Message Type</h4>
                <pre style={{ ...styles.jsonViewer, marginBottom: '20px' }}>
                  {previewRequest.messageType || 'N/A'}
                </pre>
                <h4 style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 500 }}>Payload Preview</h4>
                <JsonViewer data={previewRequest.body} isXml={isXml} />
              </>
            ) : (
              <>
                <h4 style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 500 }}>Headers</h4>
                <pre style={{ ...styles.jsonViewer, marginBottom: '20px' }}>
                  {JSON.stringify(item.request?.headers, null, 2)}
                </pre>
                <h4 style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 500 }}>Body</h4>
                <JsonViewer data={item.request?.body} isXml={isXml} />
              </>
            )}
          </>
        )}
        {activeTab === 'response' && !previewRequest && (
          <>
            <h4 style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 500 }}>
              Status: {item.status} {item.statusText}
            </h4>
            <h4 style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 500, marginTop: '16px' }}>Headers</h4>
            <pre style={{ ...styles.jsonViewer, marginBottom: '20px' }}>
              {JSON.stringify(item.response?.headers, null, 2)}
            </pre>
            <h4 style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 500 }}>Body</h4>
            <JsonViewer data={item.response?.body} isXml={isXml} />
          </>
        )}
      </div>
    </div>
  );
};

const QuickTestPanel = ({ onSendRequest, isLive, onTestPreview }) => {
  const [selectedTest, setSelectedTest] = useState('product_catalog');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customBody, setCustomBody] = useState('');

  const testCases = {
    product_catalog: { endpoint: '/api/ess/products/catalog', method: 'POST', messageType: 'PRODUCT_DETAIL', body: {} },
    loan_charges: { endpoint: '/api/ess/loan/charges', method: 'POST', messageType: 'LOAN_CHARGES_REQUEST', body: { CheckNumber: '111222333', BasicSalary: '500000', NetSalary: '400000', Tenure: '12', ProductCode: 'LA1001' } },
    loan_offer: { endpoint: '/api/ess/loan/offer', method: 'POST', messageType: 'LOAN_OFFER_REQUEST', body: { CheckNumber: '111222333', FirstName: 'John', LastName: 'Doe', RequestedAmount: '1000000', Tenure: '12', ProductCode: 'LA1001', ApplicationNumber: `APP_${Date.now()}` } },
    account_validate: { endpoint: '/api/ess/account/validate', method: 'POST', messageType: 'ACCOUNT_VALIDATION', body: { AccountNumber: '011445888578', FirstName: 'John', LastName: 'Doe' } },
    branches: { endpoint: '/api/ess/branches', method: 'GET', messageType: null, body: null },
    deduction_stop: { endpoint: '/api/ess/deduction/stop', method: 'POST', messageType: 'DEDUCTION_STOP_NOTIFICATION', body: { ApplicationNumber: `APP_${Date.now()}`, StopReason: 'Employment termination', StopDate: new Date().toISOString() } },
    restructure_initiate: { endpoint: '/api/ess/restructuring/initiate-fsp', method: 'POST', messageType: 'FSP_RESTRUCTURE_INITIATE', body: { LoanNumber: '20070001', Reason: 'Hardship case', ProposedTenure: '48', ProposedAmount: '5000000' } },
    takeover_cancel: { endpoint: '/api/ess/takeover/cancel', method: 'POST', messageType: 'TAKEOVER_CANCEL_REJECTION', body: { ApplicationNumber: `APP_${Date.now()}`, LoanNumber: '20070001', Reason: 'Employee declined offer' } },
    liquidation: { endpoint: '/api/ess/loan/liquidation', method: 'POST', messageType: 'LOAN_LIQUIDATION', body: { LoanNumber: '20070001', ApplicationNumber: `APP_${Date.now()}`, OutstandingBalance: '0', LiquidationDate: new Date().toISOString() } },
    defaulter_ack: { endpoint: '/api/ess/defaulter/acknowledge', method: 'POST', messageType: 'DEFAULTER_ACKNOWLEDGE', body: { CheckNumber: '111222333', LoanNumber: '20070001', EmployeeStatus: 'Suspended', ActionTaken: 'Legal notice issued' } },
  };

  const handleTestSelect = (testKey) => {
    setSelectedTest(testKey);
    if (testKey !== 'custom' && testCases[testKey]) {
      const test = testCases[testKey];
      onTestPreview({
        method: test.method,
        endpoint: test.endpoint,
        messageType: test.messageType,
        body: test.body
      });
    } else if (testKey === 'custom') {
      onTestPreview(null);
    }
  };

  const handleSend = () => {
    if (selectedTest === 'custom' && customEndpoint) {
      onSendRequest('POST', customEndpoint, customBody || null);
    } else {
      const test = testCases[selectedTest];
      if (test) {
        onSendRequest(test.method, test.endpoint, test.body, test.messageType);
        onTestPreview(null);
      }
    }
  };

  return (
    <div style={{ borderTop: '1px solid #1e293b', padding: '16px 20px', backgroundColor: '#0a0f1a' }}>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', fontWeight: 500 }}>QUICK TEST</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select
          value={selectedTest}
          onChange={(e) => handleTestSelect(e.target.value)}
          style={styles.filterSelect}
          disabled={!isLive}
        >
          <option value="product_catalog">📦 Product Catalog</option>
          <option value="loan_charges">💰 Loan Charges</option>
          <option value="loan_offer">📝 Loan Offer</option>
          <option value="account_validate">✅ Account Validate</option>
          <option value="branches">🏢 FSP Branches</option>
          <option value="deduction_stop">⛔ Deduction Stop</option>
          <option value="restructure_initiate">🔄 FSP Restructure</option>
          <option value="takeover_cancel">❌ Takeover Cancel</option>
          <option value="liquidation">✓ Loan Liquidation</option>
          <option value="defaulter_ack">📋 Defaulter Ack</option>
          <option value="custom">⚙️ Custom Request</option>
        </select>
        <button onClick={handleSend} style={{ ...styles.envButton, backgroundColor: '#3b82f6', color: '#fff' }} disabled={!isLive}>
          Send Request
        </button>
      </div>
      {selectedTest === 'custom' && (
        <div style={{ marginTop: '10px' }}>
          <input
            type="text"
            placeholder="Endpoint (e.g., /loan/status)"
            value={customEndpoint}
            onChange={(e) => setCustomEndpoint(e.target.value)}
            style={{ ...styles.filterInput, width: '100%', marginBottom: '8px' }}
          />
          <textarea
            placeholder="Request body (XML or JSON)"
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
            rows={3}
            style={{ ...styles.filterInput, width: '100%', fontFamily: 'monospace', fontSize: '11px' }}
          />
        </div>
      )}
    </div>
  );
};

// ==================== FSP NOTIFICATIONS PANEL ====================
const FspNotificationsPanel = ({ onSendRequest, isLive, selectedLog }) => {
  const [notificationType, setNotificationType] = useState('loan_approval');

  const handleSendNotification = () => {
    if (!selectedLog) return;

    let endpoint = '/api/ess/notification';
    let messageType = 'LOAN_INITIAL_APPROVAL_NOTIFICATION';
    let body = {
      MessageDetails: {
        ApplicationNumber: selectedLog.id || 'TEST_APP_001',
        FSPReferenceNumber: '12345',
        LoanNumber: '20070001',
        Approval: 'APPROVED',
        Reason: 'Loan approved'
      }
    };

    switch(notificationType) {
      case 'loan_approval':
        endpoint = '/api/ess/notification';
        messageType = 'LOAN_INITIAL_APPROVAL_NOTIFICATION';
        break;
      case 'disbursement':
        messageType = 'LOAN_DISBURSEMENT_NOTIFICATION';
        body.MessageDetails.TotalAmountToPay = 5000000;
        body.MessageDetails.DisbursementDate = new Date().toISOString();
        break;
      case 'disbursement_failure':
        messageType = 'LOAN_DISBURSEMENT_FAILURE_NOTIFICATION';
        body.MessageDetails.Reason = 'Insufficient funds';
        break;
      case 'restructuring':
        messageType = 'LOAN_RESTRUCTURED_NOTIFICATION';
        break;
      case 'payment_ack':
        messageType = 'PAYMENT_ACKNOWLEDGMENT_NOTIFICATION';
        body.MessageDetails.PaymentAmount = 100000;
        body.MessageDetails.PaymentDate = new Date().toISOString();
        break;
    }

    onSendRequest('POST', endpoint, body, messageType);
  };

  return (
    <div style={{ borderTop: '1px solid #1e293b', padding: '16px 20px', backgroundColor: '#0a0f1a' }}>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', fontWeight: 500 }}>FSP NOTIFICATIONS</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select
          value={notificationType}
          onChange={(e) => setNotificationType(e.target.value)}
          style={styles.filterSelect}
          disabled={!isLive || !selectedLog}
        >
          <option value="loan_approval">✓ Loan Approved</option>
          <option value="disbursement">💸 Loan Disbursed</option>
          <option value="disbursement_failure">✗ Disbursement Failed</option>
          <option value="restructuring">🔄 Restructure Complete</option>
          <option value="payment_ack">✓ Payment Acknowledged</option>
        </select>
        <button 
          onClick={handleSendNotification} 
          style={{ ...styles.envButton, backgroundColor: '#10b981', color: '#fff' }} 
          disabled={!isLive || !selectedLog}
          title={!selectedLog ? 'Select an API call from logs first' : ''}
        >
          Send
        </button>
      </div>
      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
        💡 Tip: Select a logged request above, then send a notification to simulate FSP async callback
      </div>
    </div>
  );
};

// ==================== MAIN APP ====================
const App = () => {
  const [environment, setEnvironment] = useState('sandbox');
  const [logs, setLogs] = useState([]);
  const [selectedLogId, setSelectedLogId] = useState(null);
  const [previewRequest, setPreviewRequest] = useState(null);
  const [filter, setFilter] = useState({ status: 'all', endpoint: '', showOnlyErrors: false });
  const [isLive, setIsLive] = useState(true);
  const [stats, setStats] = useState({ total: 0, success: 0, errors: 0, avgDuration: 0 });
  
  const apiClientRef = useRef(null);

  useEffect(() => {
    apiClientRef.current = new ApiClient(API_BASE[environment], 'FL7407', (logEntry) => {
      setLogs(prev => [logEntry, ...prev].slice(0, 500));
      setStats(prev => ({
        total: prev.total + 1,
        success: prev.success + (logEntry.isError ? 0 : 1),
        errors: prev.errors + (logEntry.isError ? 1 : 0),
        avgDuration: (prev.avgDuration * prev.total + logEntry.duration) / (prev.total + 1),
      }));
    });
  }, [environment]);

  const sendRequest = useCallback(async (method, endpoint, body, messageType) => {
    if (!apiClientRef.current) return;
    setIsLive(false);
    try {
      await apiClientRef.current.request(method, endpoint, body, messageType);
    } finally {
      setIsLive(true);
    }
  }, []);

  const filteredLogs = logs.filter(log => {
    if (filter.showOnlyErrors && !log.isError) return false;
    if (filter.status !== 'all') {
      if (filter.status === 'success' && log.isError) return false;
      if (filter.status === 'error' && !log.isError) return false;
    }
    if (filter.endpoint && !log.endpoint.toLowerCase().includes(filter.endpoint.toLowerCase())) return false;
    return true;
  });

  const selectedLog = logs.find(l => l.id === selectedLogId);

  const clearLogs = () => {
    setLogs([]);
    setStats({ total: 0, success: 0, errors: 0, avgDuration: 0 });
    setSelectedLogId(null);
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emokopo-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      {/* Sidebar - API Activity List */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={styles.sidebarTitle}>API ACTIVITY</div>
            <button
              onClick={() => {
                localStorage.removeItem('authToken');
                localStorage.removeItem('userData');
                window.location.reload();
              }}
              style={{
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
              title="Logout"
            >
              Logout
            </button>
          </div>
          <div style={styles.filterBar}>
            <input
              type="text"
              placeholder="Filter endpoints..."
              value={filter.endpoint}
              onChange={(e) => setFilter({ ...filter, endpoint: e.target.value })}
              style={styles.filterInput}
            />
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              style={styles.filterSelect}
            >
              <option value="all">All Status</option>
              <option value="success">Success (2xx)</option>
              <option value="error">Error (4xx/5xx)</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filter.showOnlyErrors}
                onChange={(e) => setFilter({ ...filter, showOnlyErrors: e.target.checked })}
              />
              Show errors only
            </label>
          </div>
        </div>
        
        <div style={styles.activityList}>
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
              No API calls yet
            </div>
          ) : (
            filteredLogs.map(log => (
              <ActivityItem
                key={log.id}
                item={log}
                isSelected={selectedLogId === log.id}
                onClick={() => setSelectedLogId(log.id)}
              />
            ))
          )}
        </div>

        <QuickTestPanel onSendRequest={sendRequest} isLive={isLive} onTestPreview={setPreviewRequest} />
        <FspNotificationsPanel onSendRequest={sendRequest} isLive={isLive} selectedLog={selectedLog} />
      </div>

      {/* Main Panel - Request/Response Inspector */}
      <div style={styles.mainPanel}>
        <div style={styles.topBar}>
          <div style={styles.envSelector}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Environment:</span>
            {['sandbox', 'staging', 'production'].map(env => (
              <button
                key={env}
                onClick={() => setEnvironment(env)}
                style={{
                  ...styles.envButton,
                  backgroundColor: environment === env ? '#3b82f6' : '#1e293b',
                  color: environment === env ? '#fff' : '#94a3b8',
                }}
              >
                {env.charAt(0).toUpperCase() + env.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={clearLogs} style={styles.actionButton}>Clear Logs</button>
            <button onClick={exportLogs} style={styles.actionButton}>Export Logs</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <RequestInspector selectedItem={selectedLog} previewRequest={previewRequest} />
        </div>

        <div style={styles.statsBar}>
          <span>📊 Total: {stats.total}</span>
          <span>✅ Success: {stats.success}</span>
          <span>❌ Errors: {stats.errors}</span>
          <span>⏱️ Avg: {Math.round(stats.avgDuration)}ms</span>
          <span>🌐 {environment.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
};

export default App;