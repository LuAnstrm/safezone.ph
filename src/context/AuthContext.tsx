import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { rankTiers } from '../data/mockData';
import apiService from '../services/api';

// Demo user for offline/fallback mode
const demoUser: User = {
  id: 'demo-1',
  email: 'demo@safezoneph.com',
  firstName: 'Demo',
  lastName: 'User',
  phone: '+63 912 345 6789',
  barangay: 'Sample Barangay',
  city: 'Manila',
  location: 'Manila, Philippines',
  bio: 'This is a demo account for testing SafeZonePH features.',
  points: 500,
  rank: 'Bantay Kaibigan',
  skills: ['First Aid', 'Community Support'],
  isVerified: true,
  createdAt: new Date().toISOString(),
};

interface RegisterData {
  firstName: string;
  lastName: string;
  phone?: string;
  barangay?: string;
  city?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, userData: RegisterData) => Promise<boolean>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('safezoneph_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const calculateRank = (points: number): string => {
    for (let i = rankTiers.length - 1; i >= 0; i--) {
      if (points >= rankTiers[i].minPoints) {
        return rankTiers[i].name;
      }
    }
    return rankTiers[0].name;
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    // Check for demo account first (works without backend)
    if (email === 'demo@safezoneph.com' && password === 'demo123') {
      const userData = { ...demoUser };
      setUser(userData);
      localStorage.setItem('safezoneph_user', JSON.stringify(userData));
      setIsLoading(false);
      return true;
    }

    // Check for locally registered users
    const localUsers = JSON.parse(localStorage.getItem('safezoneph_local_users') || '[]');
    const localUser = localUsers.find((u: { email: string; password: string }) => 
      u.email === email && u.password === password
    );
    
    if (localUser) {
      const userData = localUser.userData;
      setUser(userData);
      localStorage.setItem('safezoneph_user', JSON.stringify(userData));
      setIsLoading(false);
      return true;
    }
    
    // Try backend API
    try {
      const response = await apiService.login({ email, password });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (response.data) {
        apiService.setToken(response.data.access_token);
        const userData = {
          ...response.data.user,
          firstName: response.data.user.first_name || response.data.user.firstName,
          lastName: response.data.user.last_name || response.data.user.lastName,
          isVerified: response.data.user.is_verified || response.data.user.isVerified,
          createdAt: response.data.user.created_at || response.data.user.createdAt,
          skills: []
        };
        setUser(userData);
        localStorage.setItem('safezoneph_user', JSON.stringify(userData));
        setIsLoading(false);
        return true;
      }
    } catch {
      // Backend failed, but we already checked local users above
      setIsLoading(false);
      throw new Error('Invalid email or password. Try: demo@safezoneph.com / demo123');
    }
    
    setIsLoading(false);
    return false;
  };

  const register = async (email: string, password: string, userData: RegisterData): Promise<boolean> => {
    setIsLoading(true);
    
    // Create user locally for demo purposes
    const newUserData: User = {
      id: `local-${Date.now()}`,
      email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      phone: userData.phone || '',
      barangay: userData.barangay || '',
      city: userData.city || '',
      location: `${userData.city || 'Philippines'}`,
      bio: '',
      points: 100,
      rank: 'Bagong Kaibigan',
      skills: [],
      isVerified: false,
      createdAt: new Date().toISOString(),
    };

    // Store in local users list
    const localUsers = JSON.parse(localStorage.getItem('safezoneph_local_users') || '[]');
    
    // Check if email already exists
    if (localUsers.some((u: { email: string }) => u.email === email)) {
      setIsLoading(false);
      throw new Error('Email already registered');
    }
    
    localUsers.push({ email, password, userData: newUserData });
    localStorage.setItem('safezoneph_local_users', JSON.stringify(localUsers));
    
    // Also try backend API (but don't fail if it doesn't work)
    try {
      const response = await apiService.register({
        email,
        password,
        first_name: userData.firstName,
        last_name: userData.lastName,
        phone: userData.phone,
        barangay: userData.barangay,
        city: userData.city,
      });
      
      if (response.data) {
        apiService.setToken(response.data.access_token);
        const backendUserData = {
          ...response.data.user,
          firstName: response.data.user.first_name || response.data.user.firstName,
          lastName: response.data.user.last_name || response.data.user.lastName,
          isVerified: response.data.user.is_verified || response.data.user.isVerified,
          createdAt: response.data.user.created_at || response.data.user.createdAt,
          skills: []
        };
        setUser(backendUserData);
        localStorage.setItem('safezoneph_user', JSON.stringify(backendUserData));
        setIsLoading(false);
        return true;
      }
    } catch {
      // Backend failed, use local user data
      console.log('Backend registration failed, using local storage');
    }
    
    // Use local user data
    setUser(newUserData);
    localStorage.setItem('safezoneph_user', JSON.stringify(newUserData));
    setIsLoading(false);
    return true;
  };

  const logout = () => {
    setUser(null);
    apiService.clearToken();
    localStorage.removeItem('safezoneph_user');
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      
      // If points are being updated, also update rank
      if (userData.points !== undefined) {
        const newRank = calculateRank(userData.points);
        if (newRank !== user.rank) {
          updatedUser.rank = newRank;
          // Could add rank up notification here
        }
      }
      
      setUser(updatedUser);
      localStorage.setItem('safezoneph_user', JSON.stringify(updatedUser));
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
