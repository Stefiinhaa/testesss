import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { setupServiceWorker } from './utils/serviceWorkerRegistration';
import '../style.css';

setupServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);
