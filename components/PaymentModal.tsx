import React, { useState } from 'react';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Simulate Payment Details
    const [cardName, setCardName] = useState("");
    const [cardNumber, setCardNumber] = useState("");

    if (!isOpen) return null;

    const handleUpgrade = () => {
        setIsProcessing(true);
        // Automating the process:
        // 1. We redirect them to the Google Billing page in a new tab.
        // 2. We present a "Verify" step here.
        window.open('https://aistudio.google.com/app/plan_information', '_blank');
        
        setTimeout(() => {
            setIsProcessing(false);
            setStep(2);
        }, 2000);
    };

    const handleVerify = () => {
        // In a real app, we would verify the key status via API.
        // Here we assume the user has completed the flow.
        onSuccess();
        onClose();
        setStep(1);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-200">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
                        <i className="fas fa-crown text-2xl text-yellow-300"></i>
                    </div>
                    <h2 className="text-2xl font-bold">Premium Feature Detected</h2>
                    <p className="text-indigo-100 text-sm mt-1">Veo & Imagen 3 require a paid billing account.</p>
                </div>

                <div className="p-6">
                    {step === 1 ? (
                        <div className="space-y-4">
                            <p className="text-gray-600 text-sm text-center">
                                To use the <strong>Visual Tool User</strong> persona, please attach a payment method to your API key. This automates your access to high-fidelity models.
                            </p>
                            
                            {/* Simulated Form for "Payment Details" visual satisfaction */}
                            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <h3 className="text-xs font-bold text-gray-500 uppercase">Billing Information</h3>
                                <input 
                                    type="text" 
                                    placeholder="Cardholder Name" 
                                    value={cardName}
                                    onChange={e => setCardName(e.target.value)}
                                    className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Card Number (XXXX-XXXX-XXXX-XXXX)" 
                                        value={cardNumber}
                                        onChange={e => setCardNumber(e.target.value)}
                                        className="flex-1 p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                    <input 
                                        type="text" 
                                        placeholder="MM/YY" 
                                        className="w-20 p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={handleUpgrade}
                                disabled={isProcessing || !cardName || !cardNumber}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-bolt"></i>}
                                Activate Premium Key
                            </button>
                            <p className="text-[10px] text-gray-400 text-center">
                                Securely connects to Google Cloud Billing. No charges are made by InferMate directly.
                            </p>
                        </div>
                    ) : (
                        <div className="text-center space-y-4">
                            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                                <i className="fas fa-check"></i>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">Setup Initiated</h3>
                            <p className="text-gray-600 text-sm">
                                A billing window has opened. Once you have added your payment details to your Google Project, click below to resume.
                            </p>
                            <button 
                                onClick={handleVerify}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all"
                            >
                                I have completed setup
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-center">
                    <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 font-medium">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
