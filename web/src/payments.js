import { apiRequest } from './api.js';

function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
    document.body.appendChild(script);
  });
}

function openRazorpayCheckout(checkout, paymentId, onStatusChange) {
  return new Promise((resolve, reject) => {
    const razorpay = new window.Razorpay({
      key: checkout.keyId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      order_id: checkout.orderId,
      prefill: checkout.prefill,
      theme: {
        color: '#0f6f4f'
      },
      handler: async (response) => {
        try {
          onStatusChange?.('Verifying payment...');
          const result = await apiRequest('/payments/razorpay/verify', {
            method: 'POST',
            body: {
              paymentId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            }
          });

          resolve(result);
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: () => reject(new Error('Payment was cancelled before completion.'))
      }
    });

    razorpay.open();
  });
}

export async function startPaymentCheckout({ chargerId, startsAt, endsAt, onStatusChange }) {
  onStatusChange?.('Creating booking hold...');
  const checkoutData = await apiRequest('/payments/checkout', {
    method: 'POST',
    body: {
      chargerId,
      startsAt,
      endsAt
    }
  });

  if (checkoutData.checkout.provider === 'MOCK') {
    onStatusChange?.('Mock payment captured.');
    return checkoutData;
  }

  onStatusChange?.('Opening Razorpay Checkout...');
  await loadRazorpayCheckout();
  onStatusChange?.('Waiting for payment confirmation...');
  const verified = await openRazorpayCheckout(checkoutData.checkout, checkoutData.payment.id, onStatusChange);
  onStatusChange?.('Payment verified.');

  return {
    ...checkoutData,
    ...verified
  };
}
