import { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { qrAPI } from '../../api';
import Spinner from '../../components/Spinner';
import toast from 'react-hot-toast';

export default function QRCodePage() {
  const { t } = useLanguage();
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await qrAPI.generate();
      setQrData(res.data);
    } catch (err) {
      toast.error('Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCopyUrl = () => {
    if (qrData?.url) {
      navigator.clipboard.writeText(qrData.url);
      toast.success('URL copied to clipboard!');
    }
  };

  const handleDownload = () => {
    if (!qrData?.qrCode) return;
    const a = document.createElement('a');
    a.href = qrData.qrCode;
    a.download = 'visitor-qr-code.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('QR code downloaded!');
  };

  const handlePrint = () => window.print();

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--gray-800)' }}>
          🔲 {t('admin_qr_code')}
        </h2>
        <p style={{ color: 'var(--gray-500)', marginTop: 4 }}>
          {t('admin_qr_instructions')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>
        {/* QR Code display */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: '1rem' }}>Visitor Portal QR Code</h3>
            <button className="btn-icon" onClick={load} title="Regenerate">🔄</button>
          </div>
          <div className="card-body" style={{ textAlign: 'center' }}>
            {loading ? (
              <div className="flex-center" style={{ height: 300, flexDirection: 'column', gap: 12 }}>
                <Spinner size="lg" />
                <p style={{ color: 'var(--gray-400)' }}>Generating QR code...</p>
              </div>
            ) : qrData ? (
              <>
                {/* QR code image */}
                <div style={{
                  display: 'inline-block',
                  padding: 20,
                  background: 'white',
                  border: '3px solid var(--primary)',
                  borderRadius: 16,
                  boxShadow: 'var(--shadow-lg)',
                  marginBottom: 16,
                }}>
                  <img
                    src={qrData.qrCode}
                    alt="Visitor Portal QR Code"
                    style={{ width: 240, height: 240, display: 'block' }}
                  />
                </div>

                <div style={{
                  background: 'var(--primary)',
                  color: 'white',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  marginBottom: 16,
                  display: 'inline-block',
                }}>
                  📱 SCAN TO REGISTER YOUR VISIT
                </div>
              </>
            ) : (
              <div className="flex-center" style={{ height: 200 }}>
                <p style={{ color: 'var(--gray-400)' }}>Failed to load QR code</p>
              </div>
            )}
          </div>
          {qrData && (
            <div className="card-footer" style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={handleDownload}>
                ⬇ {t('admin_download_qr')}
              </button>
              <button className="btn btn-outline btn-sm" onClick={handlePrint}>
                🖨 {t('print')}
              </button>
            </div>
          )}
        </div>

        {/* Info panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* URL display */}
          <div className="card">
            <div className="card-header">
              <h3 style={{ fontSize: '1rem' }}>🌐 {t('admin_qr_url')}</h3>
            </div>
            <div className="card-body">
              {qrData && (
                <>
                  <div style={{
                    background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                    borderRadius: 8, padding: '10px 14px',
                    fontFamily: 'monospace', fontSize: '0.875rem',
                    color: 'var(--primary)', wordBreak: 'break-all',
                    marginBottom: 12,
                  }}>
                    {qrData.url}
                  </div>
                  <button className="btn btn-outline btn-sm btn-full" onClick={handleCopyUrl}>
                    📋 {t('admin_copy_url')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="card">
            <div className="card-header">
              <h3 style={{ fontSize: '1rem' }}>📋 Display Instructions</h3>
            </div>
            <div className="card-body">
              <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  'Download or print the QR code above.',
                  'Display it prominently at the reception desk or entrance.',
                  'Visitors scan it with their smartphone to access the registration portal.',
                  'Alternatively, share the portal URL via email or display it on a screen.',
                  'The QR code links directly to the visitor registration form.',
                ].map((step, i) => (
                  <li key={i} style={{ fontSize: '0.875rem', color: 'var(--gray-600)', lineHeight: 1.5 }}>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Visitor flow summary */}
          <div className="card">
            <div className="card-header">
              <h3 style={{ fontSize: '1rem' }}>🔄 Visitor Flow</h3>
            </div>
            <div className="card-body">
              {[
                { icon: '📱', text: 'Visitor scans QR code' },
                { icon: '📝', text: 'Completes registration form' },
                { icon: '🎬', text: 'Watches HSE induction' },
                { icon: '📋', text: 'Passes safety assessment (80%)' },
                { icon: '✅', text: 'Checks in & receives badge' },
                { icon: '🚪', text: 'Scans QR again to check out' },
              ].map((step, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: i < 5 ? '1px solid var(--gray-100)' : 'none',
                }}>
                  <span style={{ fontSize: '1.2rem' }}>{step.icon}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>{step.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
