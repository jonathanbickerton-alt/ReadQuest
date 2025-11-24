import React from 'react';
import { AppSettings } from '../types';
import { Settings, Type, Palette } from 'lucide-react';

interface Props {
  settings: AppSettings;
  updateSettings: (s: Partial<AppSettings>) => void;
}

const SettingsPanel: React.FC<Props> = ({ settings, updateSettings }) => {
  return (
    <div className="bg-white/90 p-4 rounded-xl shadow-lg border border-gray-200 backdrop-blur-sm">
      <h3 className="flex items-center gap-2 font-bold text-gray-700 mb-4">
        <Settings className="w-5 h-5" /> Reading Settings
      </h3>
      
      <div className="space-y-4">
        {/* Font Toggle */}
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <Type className="w-4 h-4" /> Font Style
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => updateSettings({ isDyslexicFont: false })}
              className={`px-3 py-1 rounded text-sm ${!settings.isDyslexicFont ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}
            >
              Standard
            </button>
            <button
              onClick={() => updateSettings({ isDyslexicFont: true })}
              className={`px-3 py-1 rounded text-sm font-dyslexic ${settings.isDyslexicFont ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}
            >
              Dyslexic Friendly
            </button>
          </div>
        </div>

        {/* Color Theme */}
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <Palette className="w-4 h-4" /> Paper Color
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => updateSettings({ colorTheme: 'default' })}
              className={`w-8 h-8 rounded-full border-2 ${settings.colorTheme === 'default' ? 'border-indigo-600' : 'border-gray-200'} bg-white`}
              title="White"
            />
            <button
              onClick={() => updateSettings({ colorTheme: 'yellow' })}
              className={`w-8 h-8 rounded-full border-2 ${settings.colorTheme === 'yellow' ? 'border-indigo-600' : 'border-gray-200'} bg-[#fdf6e3]`}
              title="Soft Yellow"
            />
            <button
              onClick={() => updateSettings({ colorTheme: 'blue' })}
              className={`w-8 h-8 rounded-full border-2 ${settings.colorTheme === 'blue' ? 'border-indigo-600' : 'border-gray-200'} bg-[#e0f7fa]`}
              title="Soft Blue"
            />
            <button
              onClick={() => updateSettings({ colorTheme: 'pink' })}
              className={`w-8 h-8 rounded-full border-2 ${settings.colorTheme === 'pink' ? 'border-indigo-600' : 'border-gray-200'} bg-[#fce4ec]`}
              title="Soft Pink"
            />
          </div>
        </div>

         {/* Font Size */}
         <div>
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <Type className="w-4 h-4" /> Size
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => updateSettings({ fontSize: 'normal' })}
              className={`px-3 py-1 rounded text-xs ${settings.fontSize === 'normal' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}
            >
              A
            </button>
            <button
              onClick={() => updateSettings({ fontSize: 'large' })}
              className={`px-3 py-1 rounded text-sm ${settings.fontSize === 'large' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}
            >
              A+
            </button>
            <button
              onClick={() => updateSettings({ fontSize: 'xl' })}
              className={`px-3 py-1 rounded text-base ${settings.fontSize === 'xl' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}
            >
              A++
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
