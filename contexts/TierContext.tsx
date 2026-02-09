import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Tier, TIER_CONFIGS, TierConfig } from '../types';

interface TierContextType {
  currentTier: Tier;
  tierConfig: TierConfig;
  setTier: (tier: Tier) => void;
}

const TierContext = createContext<TierContextType | undefined>(undefined);

export const TierProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentTier, setTier] = useState<Tier>(Tier.FREE);

  return (
    <TierContext.Provider value={{ 
      currentTier, 
      tierConfig: TIER_CONFIGS[currentTier], 
      setTier 
    }}>
      {children}
    </TierContext.Provider>
  );
};

export const useTier = () => {
  const context = useContext(TierContext);
  if (!context) throw new Error('useTier must be used within a TierProvider');
  return context;
};