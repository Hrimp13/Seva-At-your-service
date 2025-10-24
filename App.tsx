

import React, { useState, useEffect, useCallback, useMemo, FC, ReactNode } from 'react';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, User } from 'firebase/auth';
// FIX: Added 'deleteDoc' and removed unused 'collectionGroup'.
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, Timestamp, Firestore, query, deleteDoc } from 'firebase/firestore';
// FIX: Added 'CartesianGrid' to the import from 'recharts' to resolve 'Cannot find name' error.
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Home, Users, Settings, LogOut, Plus, Search, ChevronDown, Bell, Sun, Moon, MapPin, Phone, Mail, QrCode, CreditCard, Calendar, FilePlus, Building, Wrench, MoreVertical, ScanLine, Trash2 } from 'lucide-react';

// --- TYPE DEFINITIONS ---
type View = 'auth' | 'role-selection' | 'dashboard' | 'vendors' | 'add-vendor' | 'settings';
type Role = 'client' | 'provider';

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  role: Role;
  settings: {
    darkMode: boolean;
    notifications: {
      push: boolean;
      email: boolean;
    };
  };
}

interface Vendor {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
}

interface Reminder {
  id: string;
  serviceName: string;
  dueDate: Timestamp;
  status: 'Pending' | 'Completed' | 'Cancelled';
  vendorName: string;
}

// Assume these are globally available, as per instructions
declare global {
  interface Window {
    __app_id: string;
    __firebase_config: any;
    __initial_auth_token: string;
  }
}

// --- MOCK DATA ---
const pieChartData = [
  { name: 'Plumbing', value: 450 },
  { name: 'Cleaning', value: 300 },
  { name: 'Electrical', value: 280 },
  { name: 'Gardening', value: 200 },
];
const COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

const barChartData = [
  { name: 'Jan', spending: 400 },
  { name: 'Feb', spending: 300 },
  { name: 'Mar', spending: 500 },
  { name: 'Apr', spending: 450 },
  { name: 'May', spending: 600 },
  { name: 'Jun', spending: 350 },
];

const mockReminders: Omit<Reminder, 'id'>[] = [
    { serviceName: 'Quarterly Pest Control', dueDate: Timestamp.fromDate(new Date(new Date().setDate(new Date().getDate() + 3))), status: 'Pending', vendorName: 'Pest Away' },
    { serviceName: 'Lawn Mowing', dueDate: Timestamp.fromDate(new Date(new Date().setDate(new Date().getDate() + 7))), status: 'Pending', vendorName: 'Green Thumb Landscaping' },
    { serviceName: 'AC Unit Inspection', dueDate: Timestamp.fromDate(new Date(new Date().setDate(new Date().getDate() - 10))), status: 'Completed', vendorName: 'Cool Breeze HVAC' },
];

// --- FIREBASE INITIALIZATION ---
const useFirebase = () => {
    return useMemo(() => {
        try {
            const app = initializeApp(window.__firebase_config);
            const auth = getAuth(app);
            const db = getFirestore(app);
            const appId = window.__app_id || 'default_app';
            return { app, auth, db, appId };
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            return { app: null, auth: null, db: null, appId: 'default_app' };
        }
    }, []);
};


// --- REUSABLE UI COMPONENTS ---

const Card: FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 ${className}`}>
    {children}
  </div>
);

const Button: FC<{ children: ReactNode; onClick: () => void; variant?: 'primary' | 'secondary' | 'ghost'; className?: string, disabled?: boolean }> = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors duration-200';
    const variantClasses = {
        primary: 'bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-300',
        secondary: 'bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-slate-600',
        ghost: 'bg-transparent text-primary-600 hover:bg-primary-100 dark:hover:bg-slate-700'
    };
    return (
        <button onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled}>
            {children}
        </button>
    );
};

const ToggleSwitch: FC<{ enabled: boolean; onChange: (enabled: boolean) => void }> = ({ enabled, onChange }) => (
    <button
        onClick={() => onChange(!enabled)}
        className={`${enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-slate-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
    >
        <span className={`${enabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
    </button>
);

const Input: FC<{ value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string; type?: string; icon?: ReactNode }> = ({ value, onChange, placeholder, type = 'text', icon }) => (
    <div className="relative">
        {icon && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">{icon}</div>}
        <input
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className={`w-full p-2 ${icon ? 'pl-10' : ''} border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none`}
        />
    </div>
);


// --- SCREEN COMPONENTS ---

const AuthScreen: FC<{ onSignIn: () => void; loading: boolean }> = ({ onSignIn, loading }) => (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8">
            <h1 className="text-5xl font-bold text-primary-600">Seva</h1>
            <p className="text-lg text-gray-600 mt-2 mb-8">Local Services, Simplified.</p>
            <Button onClick={onSignIn} className="w-64" disabled={loading}>
                <svg className="w-5 h-5" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.82l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
                Continue with Google
            </Button>
        </div>
    </div>
);

const RoleSelectionScreen: FC<{ user: User; onRoleSelect: (role: Role) => void }> = ({ user, onRoleSelect }) => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-gray-200">
        <h1 className="text-3xl font-bold mb-2">Welcome, {user.displayName}!</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">To get started, please select your role:</p>
        <div className="flex gap-8">
            <div onClick={() => onRoleSelect('client')} className="w-64 h-64 flex flex-col items-center justify-center p-6 border-2 border-transparent hover:border-primary-500 rounded-lg shadow-lg cursor-pointer transition-all bg-white dark:bg-slate-800">
                <Users className="w-16 h-16 text-primary-500 mb-4" />
                <h2 className="text-xl font-semibold">I Need Services</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Find, book, and manage local service providers.</p>
            </div>
            <div onClick={() => onRoleSelect('provider')} className="w-64 h-64 flex flex-col items-center justify-center p-6 border-2 border-transparent hover:border-primary-500 rounded-lg shadow-lg cursor-pointer transition-all bg-white dark:bg-slate-800">
                <Building className="w-16 h-16 text-primary-500 mb-4" />
                <h2 className="text-xl font-semibold">I Provide Services</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Manage your clients, schedule, and business.</p>
            </div>
        </div>
    </div>
);

const ProviderDashboard: FC = () => (
    <div className="text-center p-10">
        <h1 className="text-3xl font-bold">Provider Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-4">This feature is currently under construction. Stay tuned!</p>
    </div>
);

const ClientDashboard: FC<{ profile: UserProfile; reminders: Reminder[]; onNavigate: (view: View) => void; onDeleteReminder: (reminderId: string) => void }> = ({ profile, reminders, onNavigate, onDeleteReminder }) => {
    const getStatusColor = (status: Reminder['status']) => {
        switch (status) {
            case 'Pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'Completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'Cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    };
    
    return (
        <div>
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-gray-600 dark:text-gray-400">Welcome back, {profile.name.split(' ')[0]}!</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card>
                        <h2 className="text-xl font-semibold mb-4">Upcoming Services</h2>
                        <div className="space-y-4">
                            {reminders.length > 0 ? reminders.map(r => (
                                <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-primary-100 dark:bg-primary-900/50 p-3 rounded-full">
                                            <Wrench className="w-5 h-5 text-primary-600 dark:text-primary-400"/>
                                        </div>
                                        <div>
                                            <p className="font-semibold">{r.serviceName}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{r.vendorName} &middot; Due: {r.dueDate.toDate().toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(r.status)}`}>{r.status}</span>
                                        <Trash2 onClick={() => onDeleteReminder(r.id)} className="w-5 h-5 text-red-500 cursor-pointer hover:text-red-700" />
                                    </div>
                                </div>
                            )) : <p className="text-gray-500 dark:text-gray-400">No upcoming services scheduled.</p>}
                        </div>
                    </Card>
                </div>
                <div>
                    <Card>
                         <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
                         <div className="space-y-3">
                            <Button onClick={() => onNavigate('add-vendor')} variant="secondary" className="w-full justify-start"><FilePlus className="w-5 h-5 text-primary-500"/> Add Provider</Button>
                            <Button onClick={() => {}} variant="secondary" className="w-full justify-start"><Calendar className="w-5 h-5 text-green-500"/> Schedule Service</Button>
                            <Button onClick={() => {}} variant="secondary" className="w-full justify-start"><CreditCard className="w-5 h-5 text-yellow-500"/> Pay Bills</Button>
                         </div>
                    </Card>
                </div>
                <Card>
                    <h2 className="text-xl font-semibold mb-4">Service Categories</h2>
                    <div style={{ width: '100%', height: 250 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={pieChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5}>
                                    {pieChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
                <Card className="lg:col-span-2">
                    <h2 className="text-xl font-semibold mb-4">Monthly Spending</h2>
                    <div style={{ width: '100%', height: 250 }}>
                        <ResponsiveContainer>
                            <BarChart data={barChartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.2)" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip cursor={{fill: 'rgba(219, 234, 254, 0.4)'}} contentStyle={{ backgroundColor: 'white', border: '1px solid #ddd' }} />
                                <Legend />
                                <Bar dataKey="spending" fill="#3b82f6" name="Spending ($)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>
        </div>
    );
};


const VendorsScreen: FC<{ vendors: Vendor[]; onNavigate: (view: View) => void; onDeleteVendor: (vendorId: string) => void }> = ({ vendors, onNavigate, onDeleteVendor }) => {
    const [filter, setFilter] = useState('');
    const filteredVendors = vendors.filter(v => 
        v.name.toLowerCase().includes(filter.toLowerCase()) ||
        v.category.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Saved Vendors</h1>
                <Button onClick={() => onNavigate('add-vendor')}>
                    <Plus className="w-5 h-5"/> Add New Provider
                </Button>
            </div>
            <div className="mb-4">
                 <Input 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search by name or category..."
                    icon={<Search className="w-5 h-5" />}
                 />
            </div>
            <Card className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="border-b dark:border-slate-700">
                        <tr>
                            <th className="p-4">Name</th>
                            <th className="p-4">Category</th>
                            <th className="p-4">Contact</th>
                            <th className="p-4">Address</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredVendors.map(vendor => (
                            <tr key={vendor.id} className="border-b dark:border-slate-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                <td className="p-4 font-semibold">{vendor.name}</td>
                                <td className="p-4">{vendor.category}</td>
                                <td className="p-4">
                                    <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-500" /> {vendor.phone}</p>
                                    <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-500" /> {vendor.email}</p>
                                </td>
                                <td className="p-4">{vendor.address}</td>
                                <td className="p-4">
                                    <div className="flex gap-2">
                                        <Trash2 onClick={() => onDeleteVendor(vendor.id)} className="w-5 h-5 text-red-500 cursor-pointer hover:text-red-700" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

const AddVendorScreen: FC<{ userId: string; onSave: () => void; db: Firestore, appId: string }> = ({ userId, onSave, db, appId }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [scanMessage, setScanMessage] = useState<string | null>(null);

    const handleSave = async () => {
        if (!name || !category) {
            alert("Name and Category are required.");
            return;
        }
        setIsSaving(true);
        try {
            const vendorsCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'vendors');
            await addDoc(vendorsCollectionRef, { name, category, phone, email, address });
            onSave();
        } catch (error) {
            console.error("Error adding vendor:", error);
            alert("Failed to save provider. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const showScanMessage = (message: string) => {
        setScanMessage(message);
        setTimeout(() => setScanMessage(null), 3000);
    };

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Add Service Provider</h1>
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Provider Name" />
                        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Service Category (e.g., Plumbing)" />
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone Number" type="tel" icon={<Phone className="w-4 h-4"/>} />
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" type="email" icon={<Mail className="w-4 h-4"/>} />
                        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" icon={<MapPin className="w-4 h-4"/>} />
                    </div>
                    <div className="space-y-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg flex flex-col justify-center items-center">
                         <Button onClick={() => showScanMessage('Business card scanned successfully!')} variant="secondary" className="w-full">
                            <ScanLine className="w-5 h-5"/> Scan Business Card
                        </Button>
                        <Button onClick={() => showScanMessage('QR code scanned successfully!')} variant="secondary" className="w-full">
                            <QrCode className="w-5 h-5"/> Scan QR Code
                        </Button>
                        {scanMessage && <p className="text-sm text-green-600 mt-2">{scanMessage}</p>}
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Provider'}
                    </Button>
                </div>
            </Card>
        </div>
    );
};


const SettingsScreen: FC<{ profile: UserProfile; onSettingsChange: (newSettings: UserProfile['settings']) => Promise<void> }> = ({ profile, onSettingsChange }) => {
    const [settings, setSettings] = useState(profile.settings);

    const handleToggle = async (key: 'darkMode' | 'push' | 'email', value: boolean) => {
        let newSettings: UserProfile['settings'];
        if (key === 'darkMode') {
            newSettings = { ...settings, darkMode: value };
        } else {
            newSettings = { ...settings, notifications: { ...settings.notifications, [key]: value } };
        }
        setSettings(newSettings);
        await onSettingsChange(newSettings);
    };
    
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Settings</h1>
            <div className="space-y-8 max-w-2xl">
                <Card>
                    <h2 className="text-xl font-semibold mb-4">Notifications</h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <p>Push Notifications</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Receive alerts on your device.</p>
                            </div>
                            <ToggleSwitch enabled={settings.notifications.push} onChange={(val) => handleToggle('push', val)} />
                        </div>
                         <div className="flex justify-between items-center">
                            <div>
                                <p>Email Notifications</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Get updates and reminders in your inbox.</p>
                            </div>
                            <ToggleSwitch enabled={settings.notifications.email} onChange={(val) => handleToggle('email', val)} />
                        </div>
                    </div>
                </Card>
                <Card>
                    <h2 className="text-xl font-semibold mb-4">Appearance</h2>
                    <div className="flex justify-between items-center">
                        <div>
                            <p>Dark Mode</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Reduce eye strain in low light.</p>
                        </div>
                        <ToggleSwitch enabled={settings.darkMode} onChange={(val) => handleToggle('darkMode', val)} />
                    </div>
                </Card>
            </div>
        </div>
    );
};

// --- LAYOUT COMPONENTS ---

const Sidebar: FC<{ currentView: View; onNavigate: (view: View) => void }> = ({ currentView, onNavigate }) => {
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: Home },
        { id: 'vendors', label: 'Vendors', icon: Users },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];
    return (
        <nav className="w-64 bg-white dark:bg-slate-800 p-4 flex flex-col shadow-lg">
            <div className="text-3xl font-bold text-primary-600 mb-10 px-2">Seva</div>
            <ul className="space-y-2">
                {navItems.map(item => (
                    <li key={item.id}>
                        <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); onNavigate(item.id as View); }}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${currentView === item.id ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-300 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                        >
                            <item.icon className="w-5 h-5" />
                            {item.label}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

const Header: FC<{ profile: UserProfile | null; onLogout: () => void }> = ({ profile, onLogout }) => (
    <header className="h-16 bg-white dark:bg-slate-800 flex items-center justify-end px-6 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
            <Bell className="text-gray-500 dark:text-gray-400 cursor-pointer" />
            {profile && (
                 <div className="flex items-center gap-3">
                    <img src={profile.photoURL} alt={profile.name} className="w-9 h-9 rounded-full"/>
                    <div>
                        <p className="font-semibold text-sm">{profile.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{profile.role}</p>
                    </div>
                    <LogOut className="text-gray-500 dark:text-gray-400 cursor-pointer w-5 h-5 ml-2" onClick={onLogout}/>
                 </div>
            )}
        </div>
    </header>
);

// --- MAIN APP COMPONENT ---

export default function App() {
    const { auth, db, appId } = useFirebase();
    const [view, setView] = useState<View>('dashboard');
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth) return;
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                const profileDoc = await getDoc(doc(db!, 'artifacts', appId, 'users', currentUser.uid, 'profiles', 'main'));
                if (profileDoc.exists()) {
                    setProfile(profileDoc.data() as UserProfile);
                } else {
                    setProfile(null); // Explicitly set to null to trigger role selection
                }
            } else {
                setUser(null);
                setProfile(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth, db, appId]);
    
    const fetchClientData = useCallback(async (userId: string) => {
        if (!db) return;
        // Fetch Vendors
        const vendorsQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'vendors'));
        const vendorsSnapshot = await getDocs(vendorsQuery);
        setVendors(vendorsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));

        // Fetch Reminders
        const remindersQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'reminders'));
        const remindersSnapshot = await getDocs(remindersQuery);
        if (remindersSnapshot.empty) {
            // Add mock reminders if none exist for demo
            for (const mock of mockReminders) {
                await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'reminders'), mock);
            }
            const newRemindersSnapshot = await getDocs(remindersQuery);
            setReminders(newRemindersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reminder)));
        } else {
            setReminders(remindersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reminder)));
        }
    }, [db, appId]);

    useEffect(() => {
        if (profile?.role === 'client' && user?.uid) {
            fetchClientData(user.uid);
        }
    }, [profile, user, fetchClientData]);
    
    useEffect(() => {
        const root = window.document.documentElement;
        if (profile?.settings.darkMode) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [profile?.settings.darkMode]);

    const handleGoogleSignIn = async () => {
        if (!auth) return;
        setLoading(true);
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            setLoading(false);
        }
    };
    
    const handleLogout = async () => {
        if (!auth) return;
        await signOut(auth);
    };

    const handleRoleSelect = async (role: Role) => {
        if (!user || !db) return;
        const newUserProfile: UserProfile = {
            uid: user.uid,
            name: user.displayName || 'New User',
            email: user.email || '',
            photoURL: user.photoURL || '',
            role: role,
            settings: {
                darkMode: false,
                notifications: { push: true, email: true }
            }
        };
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profiles', 'main'), newUserProfile);
        setProfile(newUserProfile);
    };
    
    const handleSettingsChange = async (newSettings: UserProfile['settings']) => {
        if (!profile || !db) return;
        const updatedProfile = { ...profile, settings: newSettings };
        await setDoc(doc(db, 'artifacts', appId, 'users', profile.uid, 'profiles', 'main'), updatedProfile);
        setProfile(updatedProfile);
    };
    
    const handleVendorAdded = () => {
        setView('vendors');
        if (user?.uid) fetchClientData(user.uid);
    }

    const handleDeleteVendor = async (vendorId: string) => {
        if (!user || !db) return;
        if (window.confirm("Are you sure you want to delete this provider? This action cannot be undone.")) {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vendors', vendorId));
                setVendors(prevVendors => prevVendors.filter(v => v.id !== vendorId));
            } catch (error) {
                console.error("Error deleting vendor:", error);
                alert("Failed to delete provider.");
            }
        }
    };

    const handleDeleteReminder = async (reminderId: string) => {
        if (!user || !db) return;
        if (window.confirm("Are you sure you want to delete this reminder? This action cannot be undone.")) {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'reminders', reminderId));
                setReminders(prevReminders => prevReminders.filter(r => r.id !== reminderId));
            } catch (error) {
                console.error("Error deleting reminder:", error);
                alert("Failed to delete reminder.");
            }
        }
    };

    if (loading) {
        return <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">Loading...</div>;
    }

    if (!user) {
        return <AuthScreen onSignIn={handleGoogleSignIn} loading={loading} />;
    }

    if (!profile) {
        return <RoleSelectionScreen user={user} onRoleSelect={handleRoleSelect} />;
    }
    
    const MainContent = () => {
        switch (view) {
            case 'dashboard':
                return profile.role === 'client' 
                    ? <ClientDashboard profile={profile} reminders={reminders} onNavigate={setView} onDeleteReminder={handleDeleteReminder} /> 
                    : <ProviderDashboard />;
            case 'vendors':
                return <VendorsScreen vendors={vendors} onNavigate={setView} onDeleteVendor={handleDeleteVendor} />;
            case 'add-vendor':
                return <AddVendorScreen userId={user.uid} onSave={handleVendorAdded} db={db!} appId={appId}/>;
            case 'settings':
                return <SettingsScreen profile={profile} onSettingsChange={handleSettingsChange} />;
            default:
                return <div>Not Found</div>;
        }
    };

    return (
        <div className={profile.settings.darkMode ? 'dark' : ''}>
            <div className="flex h-screen bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-gray-200 font-sans">
                <Sidebar currentView={view} onNavigate={setView} />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <Header profile={profile} onLogout={handleLogout} />
                    <main className="flex-1 overflow-x-hidden overflow-y-auto p-6">
                        <MainContent />
                    </main>
                </div>
            </div>
        </div>
    );
}