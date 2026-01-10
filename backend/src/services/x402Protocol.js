import { v4 as uuidv4 } from 'uuid';
import { Offer, Receipt } from '../models/schemas.js';

/**
 * x402 Payment Protocol Implementation
 * 
 * Flow:
 * 1. Request quote → Get 402 Payment Required with pricing info
 * 2. Compare offers from multiple providers
 * 3. Pay the winner and retry the request
 * 4. Store receipt and return result
 */

export class X402Protocol {
  constructor() {
    this.providers = new Map();
  }

  /**
   * Register a tool provider
   */
  registerProvider(toolId, provider) {
    this.providers.set(toolId, provider);
  }

  /**
   * Request a quote from a tool (simulates 402 Payment Required)
   * Returns pricing info without executing
   */
  async requestQuote(toolId, params) {
    const provider = this.providers.get(toolId);
    if (!provider) {
      throw new Error(`No provider registered for tool: ${toolId}`);
    }

    // Get quote from provider (402 Payment Required equivalent)
    const quoteInfo = await provider.getQuote(params);
    
    // Create offer record
    const offer = await Offer.create({
      tool_id: toolId,
      tool_name: provider.name,
      provider: provider.providerName,
      price_usd: quoteInfo.price_usd,
      latency_estimate_ms: quoteInfo.latency_estimate_ms,
      reliability_score: quoteInfo.reliability_score,
      quote_expires_at: new Date(Date.now() + 60000), // 1 minute expiry
      status: 'pending',
      request_params: params
    });

    return {
      offer_id: offer._id,
      ...quoteInfo,
      x402_response: {
        status: 402,
        headers: {
          'X-Payment-Required': 'true',
          'X-Price-USD': quoteInfo.price_usd.toString(),
          'X-Quote-Id': offer._id.toString(),
          'X-Expires': offer.quote_expires_at.toISOString()
        }
      }
    };
  }

  /**
   * Request quotes from all registered providers for a tool type
   */
  async sweepQuotes(toolType, params) {
    const quotes = [];
    
    for (const [toolId, provider] of this.providers) {
      if (provider.type === toolType) {
        try {
          const quote = await this.requestQuote(toolId, params);
          quotes.push(quote);
        } catch (err) {
          console.error(`Quote failed for ${toolId}:`, err.message);
        }
      }
    }

    return quotes;
  }

  /**
   * Select the best offer based on price/latency/reliability
   */
  selectBestOffer(quotes, strategy = 'cheapest') {
    if (quotes.length === 0) return null;

    switch (strategy) {
      case 'cheapest':
        return quotes.reduce((best, q) => 
          q.price_usd < best.price_usd ? q : best
        );
      
      case 'fastest':
        return quotes.reduce((best, q) => 
          (q.latency_estimate_ms || Infinity) < (best.latency_estimate_ms || Infinity) ? q : best
        );
      
      case 'reliable':
        return quotes.reduce((best, q) => 
          (q.reliability_score || 0) > (best.reliability_score || 0) ? q : best
        );
      
      case 'balanced':
        // Score = reliability * 0.4 + (1/price) * 0.4 + (1/latency) * 0.2
        return quotes.reduce((best, q) => {
          const scoreQ = (q.reliability_score || 0.5) * 0.4 + 
                         (1 / q.price_usd) * 0.4 + 
                         (1 / (q.latency_estimate_ms || 1000)) * 0.2;
          const scoreBest = (best.reliability_score || 0.5) * 0.4 + 
                            (1 / best.price_usd) * 0.4 + 
                            (1 / (best.latency_estimate_ms || 1000)) * 0.2;
          return scoreQ > scoreBest ? q : best;
        });
      
      default:
        return quotes[0];
    }
  }

  /**
   * Pay for an offer and execute the tool
   */
  async payAndExecute(offerId) {
    const offer = await Offer.findById(offerId);
    if (!offer) {
      throw new Error('Offer not found');
    }

    if (offer.status !== 'pending') {
      throw new Error(`Offer already ${offer.status}`);
    }

    if (new Date() > offer.quote_expires_at) {
      await Offer.findByIdAndUpdate(offerId, { status: 'expired' });
      throw new Error('Quote expired');
    }

    const provider = this.providers.get(offer.tool_id);
    if (!provider) {
      throw new Error(`Provider not found for tool: ${offer.tool_id}`);
    }

    // Mark other pending offers for same request as rejected
    // (In real system, this would happen after successful payment)

    // Simulate payment
    const transactionId = `tx_${uuidv4()}`;
    const startTime = Date.now();

    try {
      // Execute the actual tool call
      const result = await provider.execute(offer.request_params);
      const executionTime = Date.now() - startTime;

      // Update offer status
      await Offer.findByIdAndUpdate(offerId, { status: 'accepted' });

      // Create receipt
      const receipt = await Receipt.create({
        offer_id: offerId,
        tool_id: offer.tool_id,
        tool_name: offer.tool_name,
        provider: offer.provider,
        amount_paid_usd: offer.price_usd,
        transaction_id: transactionId,
        x402_headers: {
          'X-Payment-Proof': transactionId,
          'X-Paid-Amount': offer.price_usd.toString(),
          'X-Settlement-Time': new Date().toISOString()
        },
        response_data: result,
        execution_time_ms: executionTime
      });

      return {
        success: true,
        result,
        receipt: {
          id: receipt._id,
          transaction_id: transactionId,
          amount_paid_usd: offer.price_usd,
          execution_time_ms: executionTime,
          provider: offer.provider
        }
      };

    } catch (err) {
      // In real x402, payment would be refunded on failure
      await Offer.findByIdAndUpdate(offerId, { status: 'rejected' });
      throw err;
    }
  }

  /**
   * Full quote-sweep-pay-execute flow
   */
  async executeWithQuoteSweep(toolType, params, strategy = 'cheapest') {
    // Step 1: Sweep quotes from all providers
    const quotes = await this.sweepQuotes(toolType, params);
    
    if (quotes.length === 0) {
      throw new Error(`No providers available for tool type: ${toolType}`);
    }

    // Step 2: Select best offer
    const bestOffer = this.selectBestOffer(quotes, strategy);
    
    // Mark rejected offers
    for (const quote of quotes) {
      if (quote.offer_id.toString() !== bestOffer.offer_id.toString()) {
        await Offer.findByIdAndUpdate(quote.offer_id, { status: 'rejected' });
      }
    }

    // Step 3: Pay and execute
    const result = await this.payAndExecute(bestOffer.offer_id);

    return {
      ...result,
      quote_sweep: {
        total_quotes: quotes.length,
        selected_provider: bestOffer.provider,
        selected_price: bestOffer.price_usd,
        rejected_quotes: quotes
          .filter(q => q.offer_id.toString() !== bestOffer.offer_id.toString())
          .map(q => ({
            provider: q.provider,
            price_usd: q.price_usd,
            reason: 'not_selected'
          }))
      }
    };
  }
}

export const x402 = new X402Protocol();

