export const COUNTRY_CODES = [
  { code: '+506', iso: 'CR', name: 'Costa Rica', flagUrl: 'https://flagcdn.com/w40/cr.png', digits: 8 },
  { code: '+505', iso: 'NI', name: 'Nicaragua', flagUrl: 'https://flagcdn.com/w40/ni.png', digits: 8 },
  { code: '+507', iso: 'PA', name: 'Panamá', flagUrl: 'https://flagcdn.com/w40/pa.png', digits: 8 },
  { code: '+502', iso: 'GT', name: 'Guatemala', flagUrl: 'https://flagcdn.com/w40/gt.png', digits: 8 },
  { code: '+503', iso: 'SV', name: 'El Salvador', flagUrl: 'https://flagcdn.com/w40/sv.png', digits: 8 },
  { code: '+504', iso: 'HN', name: 'Honduras', flagUrl: 'https://flagcdn.com/w40/hn.png', digits: 8 },
  { code: '+52', iso: 'MX', name: 'México', flagUrl: 'https://flagcdn.com/w40/mx.png', digits: 10 },
  { code: '+1', iso: 'US', name: 'EE.UU.', flagUrl: 'https://flagcdn.com/w40/us.png', digits: 10 },
  { code: '+57', iso: 'CO', name: 'Colombia', flagUrl: 'https://flagcdn.com/w40/co.png', digits: 10 },
  { code: '+54', iso: 'AR', name: 'Argentina', flagUrl: 'https://flagcdn.com/w40/ar.png', digits: 10 },
  { code: '+34', iso: 'ES', name: 'España', flagUrl: 'https://flagcdn.com/w40/es.png', digits: 9 },
  { code: '+58', iso: 'VE', name: 'Venezuela', flagUrl: 'https://flagcdn.com/w40/ve.png', digits: 10 },
  { code: '+51', iso: 'PE', name: 'Perú', flagUrl: 'https://flagcdn.com/w40/pe.png', digits: 9 },
  { code: '+56', iso: 'CL', name: 'Chile', flagUrl: 'https://flagcdn.com/w40/cl.png', digits: 9 },
  { code: '+593', iso: 'EC', name: 'Ecuador', flagUrl: 'https://flagcdn.com/w40/ec.png', digits: 9 },
  { code: '+591', iso: 'BO', name: 'Bolivia', flagUrl: 'https://flagcdn.com/w40/bo.png', digits: 8 },
  { code: '+595', iso: 'PY', name: 'Paraguay', flagUrl: 'https://flagcdn.com/w40/py.png', digits: 9 },
  { code: '+598', iso: 'UY', name: 'Uruguay', flagUrl: 'https://flagcdn.com/w40/uy.png', digits: 8 },
  { code: '+1-787', iso: 'PR', name: 'Puerto Rico', flagUrl: 'https://flagcdn.com/w40/pr.png', digits: 10 }
];

export const validateBirthDate = (birthDateStr) => {
  if (!birthDateStr) {
    return { valid: false, message: 'La fecha de nacimiento es obligatoria.' };
  }
  const birth = new Date(birthDateStr);
  const year = birth.getFullYear();
  if (isNaN(year) || year < 1900) {
    return { valid: false, message: 'La fecha de nacimiento debe ser igual o posterior al año 1900.' };
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (birth > today) {
    return { valid: false, message: 'La fecha de nacimiento no puede ser posterior a la fecha actual.' };
  }
  return { valid: true };
};

export const validateNationalId = (idStr, idType = 'NACIONAL', label = 'Cédula') => {
  const trimmed = String(idStr || '').trim();
  if (!trimmed) {
    return { valid: false, message: `${label} es requerida.` };
  }
  if (idType === 'NACIONAL') {
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length < 9 || digitsOnly.length > 12) {
      return { valid: false, message: `${label} costarricense debe tener entre 9 y 12 dígitos válidos.` };
    }
  } else if (idType === 'DIMEX') {
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length < 11 || digitsOnly.length > 12) {
      return { valid: false, message: `${label} de tipo DIMEX debe tener entre 11 y 12 dígitos.` };
    }
  } else {
    if (trimmed.length < 5 || trimmed.length > 20) {
      return { valid: false, message: `${label} (Pasaporte) debe tener entre 5 y 20 caracteres.` };
    }
  }
  return { valid: true };
};

export const validatePhone = (phoneStr, label = 'Teléfono') => {
  const trimmed = String(phoneStr || '').trim();
  if (!trimmed) return { valid: true };
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return { valid: false, message: `El número de ${label} debe tener entre 8 y 15 dígitos.` };
  }
  return { valid: true };
};

export const validateEmail = (emailStr, label = 'Correo electrónico') => {
  const trimmed = String(emailStr || '').trim();
  if (!trimmed) return { valid: true };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, message: `El formato de ${label} ("${trimmed}") no es válido.` };
  }
  return { valid: true };
};

export const validatePhoneNumber = (phoneCode, rawNumber) => {
  const digitsOnly = String(rawNumber || '').replace(/\D/g, '');
  if (!digitsOnly) return { valid: false, message: 'Por favor ingresa tu número telefónico.' };

  const country = COUNTRY_CODES.find(c => c.code === phoneCode);
  if (country && country.digits) {
    if (digitsOnly.length !== country.digits) {
      return {
        valid: false,
        message: `El número para ${country.name} (${country.code}) debe tener exactamente ${country.digits} dígitos.`
      };
    }
  } else {
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return { valid: false, message: 'El número telefónico debe tener entre 7 y 15 dígitos.' };
    }
  }

  return { valid: true, formatted: `${phoneCode} ${digitsOnly}`, rawDigits: digitsOnly };
};
