import React from 'react';
import { UserProfile } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Award, Flame, Zap, TrendingUp, LogOut } from 'lucide-react';

interface ProfilePageProps {
    readonly profile: UserProfile;
    readonly onLogout?: () => void;
    readonly username?: string;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ profile, onLogout, username }) => {
    return (
        <div className="container mx-auto max-w-2xl px-4 py-8 space-y-8">

            {/* Header Stats */}
            <div className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                        L{profile.level}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {username ?? 'Learner'}
                        </h1>
                        <p className="text-slate-500">Keep up the great work!</p>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                    <div>
                        <p className="text-sm text-slate-400 uppercase tracking-wider font-bold mb-1">Total XP</p>
                        <p className="text-4xl font-bold text-slate-800">{profile.xp}</p>
                    </div>
                    {onLogout && (
                        <Button variant="ghost" size="sm" onClick={onLogout}>
                            <LogOut size={14} className="mr-1" />
                            Sign Out
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                    <div className="flex items-center gap-4 p-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
                            <Flame size={24} fill="currentColor" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-slate-800">{profile.streak}</p>
                            <p className="text-xs text-orange-600 font-bold uppercase tracking-wide">Day Streak</p>
                        </div>
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                    <div className="flex items-center gap-4 p-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                            <Zap size={24} fill="currentColor" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-slate-800">{profile.quests.filter(quest => quest.completed).length}</p>
                            <p className="text-xs text-blue-600 font-bold uppercase tracking-wide">Quests Done</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Quest History / Recent Achievements */}
            <div>
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Award className="text-yellow-500" />
                    Recent Achievements
                </h2>
                <div className="space-y-3">
                    {profile.quests.map((quest) => (
                        <div key={quest.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${quest.completed ? 'bg-green-50 border-green-200 opacity-100' : 'bg-slate-50 border-slate-100 opacity-60 grayscale'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${quest.completed ? 'bg-green-500 text-white shadow-md' : 'bg-slate-200 text-slate-400'}`}>
                                    {quest.completed ? '✓' : '○'}
                                </div>
                                <div>
                                    <h3 className={`font-bold ${quest.completed ? 'text-green-900' : 'text-slate-700'}`}>{quest.title}</h3>
                                    <p className="text-xs text-slate-500">{quest.description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className={`font-bold ${quest.completed ? 'text-green-600' : 'text-slate-400'}`}>+{quest.xpReward} XP</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Progress Graph Placeholder */}
            <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp size={20} className="text-slate-400" />
                        Learning Curve (sample data)
                    </h3>
                    <select disabled aria-label="Sample chart period" className="text-xs bg-slate-100 border-none rounded-md px-2 py-1 text-slate-600">
                        <option>Last 7 Days</option>
                        <option>Last 30 Days</option>
                    </select>
                </div>
                <div className="h-40 flex items-end justify-between px-2 gap-2">
                    {[30, 45, 20, 60, 50, 80, profile.xp > 0 ? profile.xp / 2 : 10].map((h, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                            <div
                                className="w-full bg-slate-100 rounded-t-lg relative group-hover:bg-blue-100 transition-colors"
                                style={{ height: '100%' }}
                            >
                                <div
                                    className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t-lg transition-all duration-1000"
                                    style={{ height: `${Math.min(h, 100)}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">
                                {new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'narrow' })}
                            </span>
                        </div>
                    ))}
                </div>
            </Card>

        </div>
    );
};
