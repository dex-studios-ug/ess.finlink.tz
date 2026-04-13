import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const endpointList = [
    {
        id: 'disbursement',
        title: 'CRDB01 - Single Disbursement',
        section: 'Core Transactions',
        icon: '💸',
        info: 'Checksum: SHA1(customerName + md5(requestID) + customerAccount + amount)',
        submitLabel: 'Process Disbursement',
        fields: [
            { name: 'customerMobile', label: 'Customer Mobile', type: 'text', placeholder: '2557xxxxxxxx', required: true, col: 6 },
            { name: 'customerAccount', label: 'Customer Account', type: 'text', placeholder: '01J2000000000', required: true, col: 6 },
            { name: 'customerName', label: 'Customer Name', type: 'text', placeholder: 'Michael Shaka', required: true, col: 6 },
            { name: 'amount', label: 'Amount (TZS)', type: 'number', placeholder: '1000 - 10,000,000,000', required: true, col: 6 },
            { name: 'currency', label: 'Currency', type: 'text', readonly: true, defaultValue: 'TZS', col: 6 },
            { name: 'paymentReference', label: 'Payment Reference', type: 'text', placeholder: 'Auto-generated if empty', col: 6 },
            { name: 'paymentDesc', label: 'Payment Description', type: 'textarea', placeholder: 'Transaction description', col: 12 },
        ],
    },
    {
        id: 'transaction-status',
        title: 'CRDB02 - Transaction Status',
        section: 'Core Transactions',
        icon: '🔍',
        info: 'Checksum: SHA1(customerAccount + md5(requestID))',
        submitLabel: 'Check Status',
        fields: [
            { name: 'requestID', label: 'Request ID', type: 'text', placeholder: 'TXN_1234567890_abc123', required: true, col: 6 },
            { name: 'customerAccount', label: 'Customer Account', type: 'text', placeholder: '01J2000000000', required: true, col: 6 },
        ],
    },
    {
        id: 'account-details',
        title: 'CRDB03 - Account Details',
        section: 'Core Transactions',
        icon: '👤',
        info: 'Checksum: SHA1(customerAccount + md5(requestID))',
        submitLabel: 'Get Account Details',
        fields: [
            { name: 'customerAccount', label: 'Customer Account', type: 'text', placeholder: '01J2000000000', required: true, col: 12 },
        ],
    },
    {
        id: 'ussd-push',
        title: 'CRDB04 - USSD Push',
        section: 'Mobile & USSD',
        icon: '📱',
        info: 'Checksum: SHA1(customerMobile + md5(requestID) + amount + accountCode)',
        submitLabel: 'Send USSD Push',
        fields: [
            { name: 'customerMobile', label: 'Customer Mobile', type: 'text', placeholder: '255700000000', required: true, col: 6 },
            { name: 'amount', label: 'Amount (TZS)', type: 'number', placeholder: '1000 - 10,000,000,000', required: true, col: 6 },
            { name: 'accountCode', label: 'Account Code', type: 'text', defaultValue: 'SP108', col: 6 },
            { name: 'currency', label: 'Currency', type: 'text', readonly: true, defaultValue: 'TZS', col: 6 },
            { name: 'paymentReference', label: 'Payment Reference', type: 'text', placeholder: 'Auto-generated if empty', col: 6 },
            { name: 'callback', label: 'Callback URL', type: 'text', placeholder: 'Auto-generated if empty', col: 6 },
        ],
    },
    {
        id: 'batch',
        title: 'Post Batch Transactions',
        section: 'Batch Operations',
        icon: '📦',
        info: 'Batch Codes: CRDBDIS01 (Disbursement) | CRDBBTCOL (Collection) | CRDBBTSRV (Cancellation)',
        submitLabel: 'Submit Batch',
        fields: [
            { name: 'batchId', label: 'Batch ID', type: 'text', placeholder: 'Auto-generated if empty', col: 6 },
            {
                name: 'batchCode',
                label: 'Batch Code',
                type: 'select',
                options: [
                    { value: 'CRDBDIS01', label: 'CRDBDIS01 - Disbursement' },
                    { value: 'CRDBBTCOL', label: 'CRDBBTCOL - Collection' },
                    { value: 'CRDBBTSRV', label: 'CRDBBTSRV - Cancellation/Reversal' },
                ],
                defaultValue: 'CRDBDIS01',
                col: 6,
            },
            {
                name: 'batchPostType',
                label: 'Batch Post Type',
                type: 'select',
                options: [
                    { value: 'S', label: 'S - Single Entry' },
                    { value: 'M', label: 'M - Multiple Entry' },
                ],
                defaultValue: 'M',
                col: 6,
            },
            {
                name: 'batchApproval',
                label: 'Batch Approval',
                type: 'select',
                options: [
                    { value: 'N', label: 'N - Post without approvals' },
                    { value: 'Y', label: 'Y - Requires approval' },
                ],
                defaultValue: 'N',
                col: 6,
            },
            { name: 'batchAccount', label: 'Batch Account', type: 'text', placeholder: '01J000000000', required: true, col: 6 },
            { name: 'batchSender', label: 'Batch Sender', type: 'text', placeholder: 'Mikes Institute', required: true, col: 6 },
            { name: 'batchDesc', label: 'Batch Description', type: 'textarea', placeholder: 'Batch description', col: 12 },
            {
                name: 'batchRecords',
                label: 'Batch Records (JSON)',
                type: 'textarea',
                placeholder: '[{"recAccount":"0000T5534534","recName":"Michael Shaka","recAmount":100000,"recRef":"00233242332","recDesc":"Salary Payment"}]',
                required: true,
                col: 12,
            },
        ],
    },
    {
        id: 'verify-batch',
        title: 'CRDB07 - Verify Batch',
        section: 'Batch Operations',
        icon: '✅',
        info: 'Verify a batch using payment reference/certificate number',
        submitLabel: 'Verify Batch',
        fields: [
            { name: 'paymentReference', label: 'Payment Reference', type: 'text', placeholder: 'CPOHQ/20/0000514', required: true, col: 12 },
        ],
    },
    {
        id: 'list-batch',
        title: 'CRDB09 - List Batch Records',
        section: 'Batch Operations',
        icon: '📝',
        info: 'Get batch records for a payment reference',
        submitLabel: 'List Records',
        fields: [
            { name: 'paymentReference', label: 'Payment Reference', type: 'text', placeholder: 'CPOHQ/20/0000514', required: true, col: 12 },
        ],
    },
    {
        id: 'approve-batch',
        title: 'CRDB08 - Approve Batch',
        section: 'Batch Operations',
        icon: '✔️',
        info: 'Approve a batch that requires approval',
        submitLabel: 'Approve Batch',
        fields: [
            { name: 'paymentReference', label: 'Payment Reference', type: 'text', placeholder: 'TETHQ/20/0001602', required: true, col: 6 },
            { name: 'payerName', label: 'Payer Name', type: 'text', placeholder: 'Asha Rose', required: true, col: 6 },
            { name: 'payerID', label: 'Payer ID', type: 'text', placeholder: '1222345343', required: true, col: 6 },
            { name: 'payerSortCode', label: 'Payer Sort Code', type: 'text', placeholder: '3306', col: 6 },
        ],
    },
    {
        id: 'batch-status',
        title: 'Batch Status',
        section: 'Batch Operations',
        icon: '📊',
        info: 'Check the status of a submitted batch',
        submitLabel: 'Get Status',
        fields: [
            { name: 'batchId', label: 'Batch ID', type: 'text', placeholder: 'CDISS33423240', required: true, col: 12 },
        ],
    },
    {
        id: 'transactions',
        title: 'Transaction History',
        section: 'Reports',
        icon: '📂',
        info: 'Search and filter transaction records',
        submitLabel: 'Search Transactions',
        fields: [
            { name: 'startDate', label: 'Start Date', type: 'date', col: 3 },
            { name: 'endDate', label: 'End Date', type: 'date', col: 3 },
            {
                name: 'status',
                label: 'Status Code',
                type: 'select',
                options: [
                    { value: '', label: 'All' },
                    { value: '200', label: '200 - Success' },
                    { value: '236', label: '236 - Failed' },
                ],
                defaultValue: '',
                col: 3,
            },
            { name: 'limit', label: 'Limit', type: 'number', defaultValue: '50', col: 3 },
            { name: 'customerAccount', label: 'Customer Account', type: 'text', placeholder: 'Filter by account number', col: 12 },
        ],
    },
];

const sections = endpointList.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
}, {});

const App = () => {
    const [currentEndpoint, setCurrentEndpoint] = useState('disbursement');
    const [activeTab, setActiveTab] = useState('execute');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [config, setConfig] = useState({
        partnerId: '',
        partnerPass: '',
        baseURL: 'http://1982.168.151.71:807',
    });
    const [formValues, setFormValues] = useState({
        currency: 'TZS',
        accountCode: 'SP108',
        batchCode: 'CRDBDIS01',
        batchPostType: 'M',
        batchApproval: 'N',
        limit: '50',
        status: '',
    });
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState(null);
    const [responseError, setResponseError] = useState(false);
    const [requestLog, setRequestLog] = useState(null);
    const [inspectorTab, setInspectorTab] = useState('response');
    const [showRequestPreview, setShowRequestPreview] = useState(false);
    const [pendingRequest, setPendingRequest] = useState(null);
    const [tableSelect, setTableSelect] = useState('');
    const [tableData, setTableData] = useState(null);
    const [tableError, setTableError] = useState(null);
    const [logsData, setLogsData] = useState(null);
    const [logsError, setLogsError] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const storedPartnerId = localStorage.getItem('crdb_partnerId');
        const storedPartnerPass = localStorage.getItem('crdb_partnerPass');
        const storedBaseURL = localStorage.getItem('crdb_baseURL');
        setConfig((prev) => ({
            partnerId: storedPartnerId || prev.partnerId,
            partnerPass: storedPartnerPass || prev.partnerPass,
            baseURL: storedBaseURL || prev.baseURL,
        }));
    }, []);

    useEffect(() => {
        localStorage.setItem('crdb_partnerId', config.partnerId);
        localStorage.setItem('crdb_partnerPass', config.partnerPass);
        localStorage.setItem('crdb_baseURL', config.baseURL);
    }, [config]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const currentMeta = useMemo(
        () => endpointList.find((item) => item.id === currentEndpoint),
        [currentEndpoint]
    );

    useEffect(() => {
        if (activeTab === 'database' && tableSelect) {
            loadTableData();
        }
    }, [activeTab, tableSelect]);

    useEffect(() => {
        if (activeTab === 'logs') {
            loadApiLogs();
        }
    }, [activeTab]);

    const updateFormValue = (name, value) => {
        setFormValues((prev) => ({ ...prev, [name]: value }));
    };

    const getRequestConfig = () => {
        if (!config.partnerId.trim() || !config.partnerPass.trim() || !config.baseURL.trim()) {
            window.alert('Please fill in all CRDB configuration fields');
            return null;
        }
        return config;
    };

    const parseResponse = async (response) => {
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    };

    const fetchJson = async (url, data) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        const payload = await parseResponse(response);
        return { ok: response.ok, status: response.status, payload };
    };

    const executeRequest = async () => {
        const configValues = getRequestConfig();
        if (!configValues) return;

        let url = '';
        const data = { ...configValues };

        switch (currentEndpoint) {
            case 'disbursement': {
                url = '/api/crdb/disbursement';
                const required = ['customerMobile', 'customerAccount', 'customerName', 'amount'];
                required.forEach((field) => {
                    data[field] = formValues[field] || '';
                });
                data.currency = formValues.currency || 'TZS';
                data.paymentReference = formValues.paymentReference || '';
                data.paymentDesc = formValues.paymentDesc || '';
                if (!data.customerMobile || !data.customerAccount || !data.customerName || !data.amount) {
                    window.alert('Please fill in all required fields');
                    return;
                }
                break;
            }
            case 'transaction-status': {
                url = '/api/crdb/transaction/status';
                data.requestID = formValues.requestID || '';
                data.customerAccount = formValues.customerAccount || '';
                if (!data.requestID || !data.customerAccount) {
                    window.alert('Please fill in all required fields');
                    return;
                }
                break;
            }
            case 'account-details': {
                url = '/api/crdb/account/details';
                data.customerAccount = formValues.customerAccount || '';
                if (!data.customerAccount) {
                    window.alert('Please enter customer account');
                    return;
                }
                break;
            }
            case 'ussd-push': {
                url = '/api/crdb/ussd/push';
                data.customerMobile = formValues.customerMobile || '';
                data.amount = formValues.amount || '';
                data.accountCode = formValues.accountCode || 'SP108';
                data.currency = formValues.currency || 'TZS';
                data.paymentReference = formValues.paymentReference || '';
                data.callback = formValues.callback || '';
                if (!data.customerMobile || !data.amount) {
                    window.alert('Please fill in all required fields');
                    return;
                }
                break;
            }
            case 'batch': {
                url = '/api/crdb/batch';
                data.batch = {
                    batchID: formValues.batchId || '',
                    batchCode: formValues.batchCode || 'CRDBDIS01',
                    batchPostType: formValues.batchPostType || 'M',
                    batchApproval: formValues.batchApproval || 'N',
                    batchAccount: formValues.batchAccount || '',
                    batchSender: formValues.batchSender || '',
                    batchDesc: formValues.batchDesc || '',
                    batchCurrency: 'TZS',
                };
                try {
                    data.records = JSON.parse(formValues.batchRecords || '[]');
                    if (!data.batch.batchAccount || !data.batch.batchSender || !Array.isArray(data.records) || data.records.length === 0) {
                        window.alert('Please fill in batch account, sender, and at least one record');
                        return;
                    }
                } catch {
                    window.alert('Invalid JSON in batch records');
                    return;
                }
                break;
            }
            case 'verify-batch': {
                url = '/api/crdb/batch/verify';
                data.paymentReference = formValues.paymentReference || '';
                if (!data.paymentReference) {
                    window.alert('Please enter payment reference');
                    return;
                }
                break;
            }
            case 'list-batch': {
                url = '/api/crdb/batch/list';
                data.paymentReference = formValues.paymentReference || '';
                if (!data.paymentReference) {
                    window.alert('Please enter payment reference');
                    return;
                }
                break;
            }
            case 'approve-batch': {
                url = '/api/crdb/batch/approve';
                data.paymentReference = formValues.paymentReference || '';
                data.payerName = formValues.payerName || '';
                data.payerID = formValues.payerID || '';
                data.payerSortCode = formValues.payerSortCode || '';
                if (!data.paymentReference || !data.payerName || !data.payerID) {
                    window.alert('Please fill in all required fields');
                    return;
                }
                break;
            }
            case 'batch-status': {
                url = '/api/crdb/batch/status';
                data.batchId = formValues.batchId || '';
                if (!data.batchId) {
                    window.alert('Please enter batch ID');
                    return;
                }
                break;
            }
            case 'transactions': {
                url = '/api/crdb/transactions';
                data.startDate = formValues.startDate || '';
                data.endDate = formValues.endDate || '';
                data.status = formValues.status || '';
                data.limit = formValues.limit || '';
                data.customerAccount = formValues.customerAccount || '';
                break;
            }
            default:
                window.alert('Unknown endpoint');
                return;
        }

        // Show request preview instead of sending immediately
        setPendingRequest({
            url,
            data,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        setShowRequestPreview(true);
    };

    const sendRequest = async () => {
        if (!pendingRequest) return;

        setLoading(true);
        setResponse(null);
        setResponseError(false);
        setShowRequestPreview(false);
        setRequestLog({
            method: 'POST',
            url: pendingRequest.url,
            headers: pendingRequest.headers,
            body: pendingRequest.data,
        });
        setInspectorTab('response');

        try {
            const result = await fetchJson(pendingRequest.url, pendingRequest.data);
            setLoading(false);
            setResponse(result.payload);
            setResponseError(!result.ok);
        } catch (error) {
            setLoading(false);
            setResponse({ error: error.message || 'Request failed' });
            setResponseError(true);
        } finally {
            setPendingRequest(null);
        }
    };

    const cancelPreview = () => {
        setShowRequestPreview(false);
        setPendingRequest(null);
    };

    const testConnection = async () => {
        const configValues = getRequestConfig();
        if (!configValues) return;

        setLoading(true);
        try {
            const result = await fetchJson('/health', {});
            setLoading(false);
            if (result.ok) {
                window.alert('✅ Connection successful! Server is healthy.');
            } else {
                window.alert('❌ Cannot connect to server');
            }
        } catch {
            setLoading(false);
            window.alert('❌ Cannot connect to server');
        }
    };

    const buildRequestBody = () => {
        const configValues = getRequestConfig();
        if (!configValues) return {};

        const data = { ...configValues };

        switch (currentEndpoint) {
            case 'disbursement': {
                data.customerMobile = formValues.customerMobile || '';
                data.customerAccount = formValues.customerAccount || '';
                data.customerName = formValues.customerName || '';
                data.amount = formValues.amount || '';
                data.currency = formValues.currency || 'TZS';
                data.paymentReference = formValues.paymentReference || '';
                data.paymentDesc = formValues.paymentDesc || '';
                break;
            }
            case 'transaction-status': {
                data.requestID = formValues.requestID || '';
                data.customerAccount = formValues.customerAccount || '';
                break;
            }
            case 'account-details': {
                data.customerAccount = formValues.customerAccount || '';
                break;
            }
            case 'ussd-push': {
                data.customerMobile = formValues.customerMobile || '';
                data.amount = formValues.amount || '';
                data.accountCode = formValues.accountCode || 'SP108';
                data.currency = formValues.currency || 'TZS';
                data.paymentReference = formValues.paymentReference || '';
                break;
            }
            case 'batch': {
                data.batch = {
                    batchID: formValues.batchId || '',
                    batchCode: formValues.batchCode || 'CRDBDIS01',
                    batchPostType: formValues.batchPostType || 'M',
                    batchApproval: formValues.batchApproval || 'N',
                    batchAccount: formValues.batchAccount || '',
                    batchSender: formValues.batchSender || '',
                    batchDesc: formValues.batchDesc || '',
                    batchCurrency: 'TZS',
                };
                try {
                    data.records = JSON.parse(formValues.batchRecords || '[]');
                } catch {
                    data.records = [];
                }
                break;
            }
            case 'verify-batch': {
                data.paymentReference = formValues.paymentReference || '';
                break;
            }
            case 'list-batch': {
                data.paymentReference = formValues.paymentReference || '';
                break;
            }
            case 'approve-batch': {
                data.paymentReference = formValues.paymentReference || '';
                data.approvalStatus = formValues.approvalStatus || '';
                break;
            }
            default:
                break;
        }

        return data;
    };

    const loadTableData = async () => {
        if (!tableSelect) {
            setTableData(null);
            setTableError(null);
            return;
        }

        setTableData('loading');
        setTableError(null);
        try {
            const result = await fetchJson('/api/database/table', { tableName: tableSelect });
            if (result.ok && result.payload && Array.isArray(result.payload.data)) {
                setTableData(result.payload.data);
            } else {
                setTableData(null);
                setTableError('Failed to load data');
            }
        } catch {
            setTableData(null);
            setTableError('Failed to load data');
        }
    };

    const loadApiLogs = async () => {
        setLogsData('loading');
        setLogsError(null);
        try {
            const result = await fetchJson('/api/logs', { limit: 100 });
            if (result.ok && result.payload && Array.isArray(result.payload.data)) {
                setLogsData(result.payload.data);
            } else {
                setLogsData(null);
                setLogsError('Failed to load logs');
            }
        } catch {
            setLogsData(null);
            setLogsError('Failed to load logs');
        }
    };

    const renderFormField = (field) => {
        const value =
            field.type === 'select'
                ? formValues[field.name] || field.defaultValue || ''
                : formValues[field.name] !== undefined
                ? formValues[field.name]
                : field.defaultValue || '';
        const commonProps = {
            id: field.name,
            value,
            onChange: (event) => updateFormValue(field.name, event.target.value),
            className: 'form-control',
            placeholder: field.placeholder || '',
            readOnly: field.readonly || false,
        };

        if (field.type === 'textarea') {
            return <textarea {...commonProps} rows={field.rows || 4} />;
        }

        if (field.type === 'select') {
            return (
                <select {...commonProps}>
                    {(field.options || []).map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            );
        }

        return <input type={field.type || 'text'} {...commonProps} />;
    };

    const renderTableContent = () => {
        if (!tableSelect) {
            return <div className="empty-state">Select a table to view data</div>;
        }
        if (tableData === 'loading') {
            return (
                <div className="loader-box">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            );
        }
        if (tableError) {
            return <div className="empty-state error">{tableError}</div>;
        }
        if (!tableData || tableData.length === 0) {
            return <div className="empty-state">No data found</div>;
        }

        const headers = Object.keys(tableData[0] || {});
        return (
            <div className="table-responsive">
                <table className="table">
                    <thead>
                        <tr>
                            {headers.map((header) => (
                                <th key={header}>{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.map((row, index) => (
                            <tr key={index}>
                                {headers.map((header) => {
                                    let value = row[header];
                                    if (value === null || value === undefined) value = '-';
                                    if (typeof value === 'object') value = JSON.stringify(value);
                                    return <td key={`${index}-${header}`}>{value}</td>;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderLogsContent = () => {
        if (logsData === 'loading') {
            return (
                <div className="loader-box">
                    <div className="spinner" />
                    <p>Loading logs...</p>
                </div>
            );
        }
        if (logsError) {
            return <div className="empty-state error">{logsError}</div>;
        }
        if (!logsData || logsData.length === 0) {
            return <div className="empty-state">No logs found</div>;
        }

        return (
            <div className="table-responsive">
                <table className="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Endpoint</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th>Response Time</th>
                            <th>Partner ID</th>
                            <th>IP Address</th>
                            <th>Created At</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logsData.map((log) => {
                            const statusClass =
                                log.status_code === 200 ? 'badge-success' : log.status_code >= 400 ? 'badge-danger' : 'badge-warning';
                            return (
                                <tr key={log.id || `${log.endpoint}-${log.created_at}`}>
                                    <td>{log.id || '-'}</td>
                                    <td>{log.endpoint || '-'}</td>
                                    <td>
                                        <span className="badge badge-secondary">{log.method || '-'}</span>
                                    </td>
                                    <td>
                                        <span className={`badge ${statusClass}`}>{log.status_code || '-'}</span>
                                    </td>
                                    <td>{log.response_time ? `${log.response_time}ms` : '-'}</td>
                                    <td>{log.partner_id || '-'}</td>
                                    <td>{log.ip_address || '-'}</td>
                                    <td>{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="app-shell">
            <style>{`
                body { margin: 0; font-family: "Geist", sans-serif, Arial, sans-serif; background: #f8f9fa; }
                .app-shell { min-height: 100vh; background: #f8f9fa; color: #1f2937; }
                .sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: 280px; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); transform: translateX(-100%); transition: transform 0.3s ease-in-out; z-index: 1050; overflow-y: auto; }
                .sidebar.open { transform: translateX(0); }
                .sidebar-inner { padding: 1.5rem 1rem; color: #fff; }
                .sidebar-title { margin: 0; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
                .sidebar-title small { color: rgba(255,255,255,0.75); font-weight: 400; }
                .sidebar hr { border-color: rgba(255,255,255,0.2); margin: 1rem 0; }
                .menu-section { margin-top: 1rem; }
                .menu-section-label { padding: 0.75rem 1rem; display: block; color: rgba(255,255,255,0.75); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }
                .menu-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; color: #fff; cursor: pointer; transition: background 0.2s, border-left-color 0.2s; border-left: 3px solid transparent; }
                .menu-item:hover { background: rgba(255,255,255,0.1); }
                .menu-item.active { background: rgba(255,255,255,0.15); border-left-color: #ffd700; }
                .menu-item span { flex: 1; font-size: 0.95rem; }
                .mobile-header { position: sticky; top: 0; background: #fff; z-index: 1040; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; align-items: center; gap: 0.75rem; padding: 0.9rem 1rem; }
                .mobile-header button { border: none; background: #1f2937; color: #fff; border-radius: 12px; width: 42px; height: 42px; cursor: pointer; display: grid; place-items: center; }
                .main-content { padding: 1rem; margin-left: 0; transition: margin 0.3s ease; height: calc(100vh - 60px); overflow-y: auto; }
                @media (min-width: 768px) {
                    .main-content { height: 100vh; }
                }
                @media (min-width: 768px) {
                    .sidebar { transform: translateX(0); }
                    .sidebar-overlay { display: none; }
                    .main-content { margin-left: 280px; }
                    .mobile-header { display: none; }
                }
                .container { max-width: 1180px; margin: 0 auto; }
                .page-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
                .page-header h3 { margin: 0; font-size: 1.25rem; }
                .page-header .current-time { color: #6b7280; font-size: 0.95rem; }
                .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); border: none; margin-bottom: 1rem; overflow: hidden; display: flex; flex-direction: column; }
                .card.inspector-card { max-height: none; }
                .card-header { padding: 1rem 1.25rem; background: #fff; border-bottom: 1px solid #e5e7eb; }
                .card-body { padding: 1.25rem; }
                .card-title { margin: 0; font-size: 1rem; }
                .inspector-tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
                .inspector-tab { border: 1px solid #e5e7eb; border-radius: 9999px; background: #fff; color: #1f2937; padding: 0.65rem 1rem; cursor: pointer; transition: all 0.2s ease; }
                .inspector-tab.active { background: #1e3c72; color: #fff; border-color: #1e3c72; }
                .form-row { display: flex; flex-wrap: wrap; gap: 1rem; margin: 0 -0.5rem; }
                .form-group { width: 100%; padding: 0 0.5rem; box-sizing: border-box; }
                .col-12 { width: 100%; }
                .col-6 { width: 100%; }
                .col-3 { width: 100%; }
                @media (min-width: 768px) { .col-6 { width: calc(50% - 1rem); } .col-3 { width: calc(25% - 1rem); } }
                .form-label { display: block; margin-bottom: 0.5rem; font-weight: 700; font-size: 0.95rem; }
                .form-control, .form-select, textarea { width: 100%; padding: 0.85rem 1rem; border-radius: 12px; border: 1px solid #d1d5db; font-size: 1rem; color: #111827; background: #fff; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
                .form-control:focus, .form-select:focus, textarea:focus { outline: none; border-color: #2a5298; box-shadow: 0 0 0 0.15rem rgba(42,82,152,0.18); }
                textarea { min-height: 120px; resize: vertical; }
                .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; border: none; border-radius: 12px; padding: 0.9rem 1.2rem; cursor: pointer; font-weight: 600; transition: opacity 0.2s ease; }
                .btn:hover { opacity: 0.95; }
                .btn-primary { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: #fff; }
                .btn-success { background: #198754; color: #fff; }
                .btn-dark { background: #111827; color: #fff; }
                .btn.full { width: 100%; }
                .alert { border-radius: 12px; padding: 1rem; background: #e7f3ff; color: #0f172a; margin-bottom: 1rem; }
                .alert strong { display: block; margin-bottom: 0.5rem; }
                .table-responsive { overflow-x: auto; }
                .table { width: 100%; border-collapse: collapse; min-width: 700px; }
                .table th, .table td { border: 1px solid #e5e7eb; padding: 0.85rem 1rem; vertical-align: top; }
                .table th { background: #1f2937; color: #fff; text-align: left; }
                .table tbody tr:nth-child(odd) { background: #f8fafc; }
                .badge { display: inline-flex; align-items: center; padding: 0.35rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; color: #fff; }
                .badge-secondary { background: #6b7280; }
                .badge-success { background: #16a34a; }
                .badge-danger { background: #dc2626; }
                .badge-warning { background: #f59e0b; color: #1f2937; }
                .text-muted { color: #6b7280; }
                .text-white-50 { color: rgba(255,255,255,0.75); }
                .empty-state { padding: 2rem 1rem; text-align: center; color: #6b7280; }
                .empty-state.error { color: #dc2626; }
                .loader-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.85rem; padding: 2rem 1rem; }
                .spinner { width: 3rem; height: 3rem; border: 5px solid #d1d5db; border-top-color: #1e3c72; border-radius: 50%; animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg);} }
                .tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
                .tab-button { border: 1px solid #e5e7eb; border-radius: 9999px; background: #fff; color: #1f2937; padding: 0.75rem 1rem; cursor: pointer; transition: background 0.2s ease; }
                .tab-button.active { background: #1e3c72; color: #fff; border-color: #1e3c72; }
                .sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1045; }
            `}</style>

            <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-inner">
                    <div className="sidebar-title">
                        <span>🏦</span>
                        <div>
                            <div>CRDB Gateway</div>
                            <small>Finlink<span style={{ color: '#0ea5e9' }}>.tz</span></small>
                        </div>
                    </div>
                    <hr />
                    {Object.entries(sections).map(([section, items]) => (
                        <div key={section} className="menu-section">
                            <div className="menu-section-label">{section}</div>
                            {items.map((item) => (
                                <div
                                    key={item.id}
                                    className={`menu-item ${currentEndpoint === item.id ? 'active' : ''}`}
                                    onClick={() => {
                                        setCurrentEndpoint(item.id);
                                        setActiveTab('execute');
                                        setSidebarOpen(false);
                                    }}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.title}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            <div className="main-content">
                <div className="mobile-header">
                    <button onClick={() => setSidebarOpen(true)}>☰</button>
                    <h4 style={{ margin: 0, flex: 1 }}>CRDB Gateway</h4>
                    <button
                        onClick={() => {
                            localStorage.removeItem('authToken');
                            localStorage.removeItem('userData');
                            window.location.reload();
                        }}
                        style={{
                            border: 'none',
                            background: '#dc2626',
                            color: '#fff',
                            borderRadius: '8px',
                            width: 'auto',
                            height: '36px',
                            cursor: 'pointer',
                            padding: '0 12px',
                            fontSize: '12px',
                            fontWeight: '500'
                        }}
                        title="Logout"
                    >
                        Logout
                    </button>
                </div>

                <div className="container">
                    <div className="page-header">
                        <h3>{currentMeta?.title || 'CRDB API'}</h3>
                        <span className="current-time">{currentTime.toLocaleString()}</span>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <h5 className="card-title">CRDB Configuration</h5>
                        </div>
                        <div className="card-body">
                            <div className="form-row">
                                <div className="form-group col-3">
                                    <label htmlFor="partnerId" className="form-label">
                                        Partner ID <span style={{ color: '#dc2626' }}>*</span>
                                    </label>
                                    <input
                                        id="partnerId"
                                        className="form-control"
                                        value={config.partnerId}
                                        onChange={(event) => setConfig((prev) => ({ ...prev, partnerId: event.target.value }))}
                                        placeholder="Enter Partner ID"
                                    />
                                </div>
                                <div className="form-group col-3">
                                    <label htmlFor="partnerPass" className="form-label">
                                        Partner Password <span style={{ color: '#dc2626' }}>*</span>
                                    </label>
                                    <input
                                        id="partnerPass"
                                        type="password"
                                        className="form-control"
                                        value={config.partnerPass}
                                        onChange={(event) => setConfig((prev) => ({ ...prev, partnerPass: event.target.value }))}
                                        placeholder="Enter Password"
                                    />
                                </div>
                                <div className="form-group col-3">
                                    <label htmlFor="baseURL" className="form-label">
                                        Base URL <span style={{ color: '#dc2626' }}>*</span>
                                    </label>
                                    <input
                                        id="baseURL"
                                        className="form-control"
                                        value={config.baseURL}
                                        onChange={(event) => setConfig((prev) => ({ ...prev, baseURL: event.target.value }))}
                                    />
                                </div>
                                <div className="form-group col-3" style={{ display: 'flex', alignItems: 'flex-end' }}>
                                    <button className="btn btn-primary full" onClick={testConnection} type="button">
                                        🔌 Test Connection
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: '20px' }}>
                        <div className="card-header">
                            <div className="tabs">
                                <button
                                    type="button"
                                    className={`tab-button ${activeTab === 'execute' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('execute')}
                                >
                                    ✈️ Execute
                                </button>
                                <button
                                    type="button"
                                    className={`tab-button ${activeTab === 'database' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('database')}
                                >
                                    🗄️ Database
                                </button>
                                <button
                                    type="button"
                                    className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('logs')}
                                >
                                    🕒 Logs
                                </button>
                            </div>
                        </div>

                        <div className="card-body">
                            {activeTab === 'execute' && (
                                <>
                                    <div className="alert">
                                        <strong>Info:</strong> {currentMeta?.info || 'Choose an endpoint and fill the form.'}
                                    </div>
                                    <div className="form-row">
                                        {currentMeta?.fields.map((field) => (
                                            <div key={field.name} className={`form-group col-${field.col || 12}`}>
                                                <label htmlFor={field.name} className="form-label">
                                                    {field.label}
                                                    {field.required ? ' *' : ''}
                                                </label>
                                                {renderFormField(field)}
                                            </div>
                                        ))}
                                    </div>
                                    <button className="btn btn-primary" onClick={executeRequest} type="button">
                                        🔍 Preview {currentMeta?.submitLabel || 'Request'}
                                    </button>

                                    {showRequestPreview && pendingRequest && (
                                        <div className="card" style={{ marginTop: '1rem', border: '2px solid #3b82f6' }}>
                                            <div className="card-header" style={{ background: '#3b82f6', color: '#fff' }}>
                                                <strong>🔍 Request Preview - Confirm Before Sending</strong>
                                            </div>
                                            <div className="card-body">
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <strong>URL:</strong> <span style={{ color: '#4b5563', fontFamily: 'monospace' }}>{pendingRequest.url}</span>
                                                </div>
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <strong>Method:</strong> <span style={{ color: '#4b5563' }}>POST</span>
                                                </div>
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <strong>Headers:</strong>
                                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0.5rem 0 0', background: '#f3f4f6', padding: '0.75rem', borderRadius: '12px', fontSize: '0.9rem' }}>
{JSON.stringify(pendingRequest.headers, null, 2)}
                                                    </pre>
                                                </div>
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <strong>Body:</strong>
                                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0.5rem 0 0', background: '#f3f4f6', padding: '0.75rem', borderRadius: '12px', fontSize: '0.9rem', maxHeight: '300px', overflow: 'auto' }}>
{JSON.stringify(pendingRequest.data, null, 2)}
                                                    </pre>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                                    <button className="btn btn-success" onClick={sendRequest} type="button">
                                                        ✅ Send Request
                                                    </button>
                                                    <button className="btn btn-dark" onClick={cancelPreview} type="button">
                                                        ❌ Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {loading && (
                                        <div className="loader-box">
                                            <div className="spinner" />
                                            <p>Processing request to CRDB...</p>
                                        </div>
                                    )}

                                    {currentEndpoint && (
                                    <div className="card inspector-card" style={{ marginTop: '1rem', flex: '1' }}>
                                        <div className="card-header" style={{ background: '#111827', color: '#fff' }}>
                                            <strong>Inspector</strong>
                                        </div>
                                        <div className="card-body" style={{ paddingBottom: '20px', overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
                                            <div className="inspector-tabs">
                                                <button
                                                    type="button"
                                                    className={`inspector-tab ${inspectorTab === 'request' ? 'active' : ''}`}
                                                    onClick={() => setInspectorTab('request')}
                                                >
                                                    Request
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`inspector-tab ${inspectorTab === 'response' ? 'active' : ''}`}
                                                    onClick={() => setInspectorTab('response')}
                                                >
                                                    Response
                                                </button>
                                            </div>

                                            {inspectorTab === 'request' ? (
                                                <div>
                                                    <div style={{ marginBottom: '0.75rem' }}>
                                                        <strong>URL:</strong> <span style={{ color: '#4b5563' }}>
                                                            {(() => {
                                                                const configValues = getRequestConfig();
                                                                if (!configValues) return '';
                                                                switch (currentEndpoint) {
                                                                    case 'disbursement': return '/api/crdb/disbursement';
                                                                    case 'transaction-status': return '/api/crdb/transaction/status';
                                                                    case 'account-details': return '/api/crdb/account/details';
                                                                    case 'ussd-push': return '/api/crdb/ussd/push';
                                                                    case 'batch': return '/api/crdb/batch';
                                                                    case 'verify-batch': return '/api/crdb/batch/verify';
                                                                    case 'list-batch': return '/api/crdb/batch/list';
                                                                    case 'approve-batch': return '/api/crdb/batch/approve';
                                                                    default: return '';
                                                                }
                                                            })()}
                                                        </span>
                                                    </div>
                                                    <div style={{ marginBottom: '0.75rem' }}>
                                                        <strong>Method:</strong> <span style={{ color: '#4b5563' }}>POST</span>
                                                    </div>
                                                    <div style={{ marginBottom: '0.75rem' }}>
                                                        <strong>Headers:</strong>
                                                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0.5rem 0 0', background: '#f3f4f6', padding: '0.75rem', borderRadius: '12px' }}>
{JSON.stringify({ 'Content-Type': 'application/json' }, null, 2)}
                                                        </pre>
                                                    </div>
                                                    <div>
                                                        <strong>Body:</strong>
                                                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0.5rem 0 0', background: '#f3f4f6', padding: '0.75rem', borderRadius: '12px', maxHeight: '400px', overflow: 'auto' }}>
{JSON.stringify(buildRequestBody(), null, 2)}
                                                        </pre>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, background: '#111827', color: '#fff', padding: '1rem', borderRadius: '12px', maxHeight: '400px', overflow: 'auto' }}>
{response !== null ? (typeof response === 'string' ? response : JSON.stringify(response, null, 2)) : 'No response yet. Make a request to see the response here.'}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    )}
                                </>
                            )}

                            {activeTab === 'database' && (
                                <>
                                    <div className="form-row" style={{ marginBottom: '1rem' }}>
                                        <div className="form-group col-8">
                                            <label htmlFor="tableSelect" className="form-label">
                                                Select Table
                                            </label>
                                            <select
                                                id="tableSelect"
                                                className="form-control"
                                                value={tableSelect}
                                                onChange={(event) => setTableSelect(event.target.value)}
                                            >
                                                <option value="">Select Table</option>
                                                <option value="transactions">📊 Transactions</option>
                                                <option value="account_lookups">👤 Account Lookups</option>
                                                <option value="ussd_requests">📱 USSD Requests</option>
                                                <option value="batches">📦 Batches</option>
                                                <option value="batch_records">📋 Batch Records</option>
                                                <option value="batch_verifications">✅ Batch Verifications</option>
                                                <option value="api_logs">📝 API Logs</option>
                                            </select>
                                        </div>
                                        <div className="form-group col-4" style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <button className="btn btn-success full" type="button" onClick={loadTableData}>
                                                🔄 Refresh
                                            </button>
                                        </div>
                                    </div>
                                    {renderTableContent()}
                                </>
                            )}

                            {activeTab === 'logs' && (
                                <>
                                    <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                                        <button className="btn btn-primary" type="button" onClick={loadApiLogs}>
                                            🔄 Refresh Logs
                                        </button>
                                    </div>
                                    {renderLogsContent()}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default App;