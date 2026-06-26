import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/apiConfig';

/**
 * Bar chart that displays interests distribution for students.
 *
 * Uses `recharts` for a responsive chart. Data is fetched from the API
 * and expected to be an array of objects: { interesse: string, quantidade: number }.
 */
const GraficoInteresses = () => {
    const [dados, setDados] = useState([]);

    useEffect(() => {
        // Chamada para o microsserviço de alunos via Gateway
        api.get('/alunos/estatisticas/interesses')
           .then(res => setDados(res.data))
           .catch(err => console.error(err));
    }, []);

    return (
        <div style={{ width: '100%', height: 300 }}>
            <h3>Interesses dos Alunos</h3>
            <ResponsiveContainer>
                <BarChart data={dados}>
                    <XAxis dataKey="interesse" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="quantidade" fill="#8884d8" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default GraficoInteresses;
